#include <QApplication>
#include <QCommandLineOption>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QCursor>
#include <QDBusConnection>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QFile>
#include <QGuiApplication>
#include <QHostAddress>
#include <QIcon>
#include <QJsonValue>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <QLocalServer>
#include <QLocalSocket>
#include <QLockFile>
#include <QMenu>
#include <QPointer>
#include <QProcess>
#include <QRegularExpression>
#include <QSaveFile>
#include <QScreen>
#include <QSet>
#include <QStandardPaths>
#include <QSystemTrayIcon>
#include <QTimer>
#include <QUrlQuery>
#include <QWebSocket>
#include <QWebSocketServer>

#include <algorithm>
#include <cmath>
#include <memory>
#include <unistd.h>

namespace {

constexpr auto kSocketName = "eyes.sock";
constexpr quint16 kBridgePort = 38271;

QString runtimeSocketPath()
{
    QString directory = QStandardPaths::writableLocation(
        QStandardPaths::RuntimeLocation);
    if (directory.isEmpty())
        directory = QDir::tempPath();
    return QDir(directory).filePath(QString::fromLatin1(kSocketName));
}

QString userVisibilityMarkerPath()
{
    const QByteArray configured = qgetenv("XDG_STATE_HOME").trimmed();
    const QString stateHome = !configured.isEmpty()
        ? QFile::decodeName(configured)
        : QDir(QDir::homePath()).filePath(QStringLiteral(".local/state"));
    return QDir(stateHome).filePath(
        QStringLiteral("eyes/user-visibility"));
}

QString userSuppressionReason()
{
    QFile marker(userVisibilityMarkerPath());
    if (!marker.exists())
        return {};
    if (!marker.open(QIODevice::ReadOnly))
        return QStringLiteral("hidden");
    const QString reason = QString::fromUtf8(marker.readAll()).trimmed();
    return reason.isEmpty() ? QStringLiteral("hidden") : reason;
}

bool persistUserSuppression(const QString &reason)
{
    const QString path = userVisibilityMarkerPath();
    if (!QDir().mkpath(QFileInfo(path).absolutePath()))
        return false;
    QSaveFile marker(path);
    if (!marker.open(QIODevice::WriteOnly))
        return false;
    marker.write(reason.toUtf8() + '\n');
    if (!marker.commit())
        return false;
    QFile::setPermissions(
        path, QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    return true;
}

void removeUserSuppression()
{
    const QString path = userVisibilityMarkerPath();
    if (QFileInfo::exists(path))
        QFile::remove(path);
}

struct AgentState {
    QString motion = QStringLiteral("idle");
    QString eyebrow = QStringLiteral("Eyes 在线");
    QString title = QStringLiteral("随时准备出发");
    QString detail = QStringLiteral("收到任务后，我会在这里工作");

    QVariantMap toMap() const
    {
        return {
            {QStringLiteral("motion"), motion},
            {QStringLiteral("eyebrow"), eyebrow},
            {QStringLiteral("title"), title},
            {QStringLiteral("detail"), detail},
        };
    }
};

class EyesService final : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.eyes.Desktop")

public:
    explicit EyesService(QObject *parent = nullptr)
        : QObject(parent)
        , m_attentionPosition(QCursor::pos())
        , m_pendingPointerPosition(m_attentionPosition)
    {
        m_suppressionReason = userSuppressionReason();
        m_state.eyebrow = QStringLiteral("Eyes 桌面上线");
        m_completionTimer.setSingleShot(true);
        m_completionTimer.setInterval(4500);
        connect(&m_completionTimer, &QTimer::timeout, this,
                [this] { setShown(false); });

        m_pointerTimer.setSingleShot(true);
        m_pointerTimer.setInterval(32);
        connect(&m_pointerTimer, &QTimer::timeout, this, [this] {
            if (!m_hasPendingPointer)
                return;
            m_hasPendingPointer = false;
            m_attentionPosition = m_pendingPointerPosition;
            m_hasPointerPosition = true;
            if (m_shown)
                Q_EMIT attentionChanged();
        });

        m_fallbackCursorTimer.setInterval(140);
        connect(&m_fallbackCursorTimer, &QTimer::timeout, this, [this] {
            // KWin only emits movement events. Silence means the pointer is still,
            // not that its last position expired. Wayland's QCursor fallback can
            // return (0, 0) when this windowless process has no pointer focus.
            if (m_kwinCursorTimer.isValid()
                || QGuiApplication::platformName() != QLatin1String("xcb"))
                return;
            setPointerPosition(QCursor::pos());
        });
    }

    AgentState state() const { return m_state; }
    QVariantMap stateMap() const { return m_state.toMap(); }
    bool shown() const { return m_shown; }
    bool suppressed() const { return !m_suppressionReason.isEmpty(); }
    bool hasPointerPosition() const { return m_hasPointerPosition; }
    QPoint attentionPosition() const { return m_attentionPosition; }

    void setShown(bool shown)
    {
        if (!shown)
            m_completionTimer.stop();
        if (shown && suppressed())
            return;
        if (m_shown == shown)
            return;
        m_shown = shown;
        if (!shown) {
            m_pointerTimer.stop();
            if (m_hasPendingPointer) {
                m_attentionPosition = m_pendingPointerPosition;
                m_hasPointerPosition = true;
                m_hasPendingPointer = false;
            }
        }
        if (shown && !m_kwinCursorTimer.isValid()
            && QGuiApplication::platformName() == QLatin1String("xcb")) {
            setPointerPosition(QCursor::pos());
            m_fallbackCursorTimer.start();
        } else {
            m_fallbackCursorTimer.stop();
        }
        Q_EMIT shownChanged();
        Q_EMIT attentionChanged();
    }

    QJsonObject applyCommand(const QString &line);

public Q_SLOTS:
    void SetPosition(int x, int y)
    {
        m_kwinCursorTimer.restart();
        m_fallbackCursorTimer.stop();
        setPointerPosition(QPoint(x, y));
    }

signals:
    void stateChanged();
    void shownChanged();
    void attentionChanged();
    void actionTriggered(const QJsonObject &action);
    void quitRequested();
    void demoRequested();

private:
    void setState(const QString &motion, const QString &eyebrow,
                  const QString &title, const QString &detail, bool show)
    {
        m_completionTimer.stop();
        m_state = {motion, eyebrow, title, detail};
        Q_EMIT stateChanged();
        if (show && !suppressed())
            setShown(true);
    }

    void playAction(QJsonObject action)
    {
        if (suppressed())
            return;
        setShown(true);
        action.insert(QStringLiteral("type"), QStringLiteral("action"));
        action.insert(QStringLiteral("sequence"), ++m_actionSequence);
        Q_EMIT actionTriggered(action);
    }

    void hideForUser()
    {
        m_suppressionReason = QStringLiteral("hidden");
        if (!persistUserSuppression(m_suppressionReason))
            qWarning() << "Eyes: unable to persist the user-hidden state";
        setShown(false);
    }

    void showForUser()
    {
        m_suppressionReason.clear();
        removeUserSuppression();
        setShown(true);
    }

    void setPointerPosition(const QPoint &position)
    {
        if ((m_hasPendingPointer && position == m_pendingPointerPosition)
            || (!m_hasPendingPointer && m_hasPointerPosition
                && position == m_attentionPosition))
            return;
        // Retain the latest global position while hidden, without a timer or
        // bridge traffic. Showing the eyes publishes it with the visibility.
        if (!m_shown) {
            m_pointerTimer.stop();
            m_hasPendingPointer = false;
            m_attentionPosition = position;
            m_pendingPointerPosition = position;
            m_hasPointerPosition = true;
            return;
        }
        m_pendingPointerPosition = position;
        m_hasPendingPointer = true;
        if (!m_pointerTimer.isActive())
            m_pointerTimer.start();
    }

    AgentState m_state;
    QString m_suppressionReason;
    bool m_shown = false;
    QTimer m_completionTimer;
    QTimer m_pointerTimer;
    QTimer m_fallbackCursorTimer;
    QElapsedTimer m_kwinCursorTimer;
    QPoint m_attentionPosition;
    QPoint m_pendingPointerPosition;
    bool m_hasPendingPointer = false;
    bool m_hasPointerPosition = false;
    int m_actionSequence = 0;
};

QJsonObject EyesService::applyCommand(const QString &line)
{
    const QString normalized = line.trimmed();
    if (normalized.isEmpty()) {
        return {
            {QStringLiteral("ok"), false},
            {QStringLiteral("error"), QStringLiteral("empty command")},
        };
    }

    const QStringList parts = normalized.split(
        QRegularExpression(QStringLiteral("\\s+")), Qt::SkipEmptyParts);
    const QString command = parts.value(0).toLower();

    if (command == QLatin1String("start")
        || command == QLatin1String("curious")) {
        setState(QStringLiteral("curious"), QStringLiteral("收到任务"),
                 QStringLiteral("正在理解任务"),
                 QStringLiteral("先把问题和线索看清楚"), true);
    } else if (command == QLatin1String("thinking")) {
        setState(QStringLiteral("thinking"), QStringLiteral("思考中"),
                 QStringLiteral("正在梳理思路"),
                 QStringLiteral("找到一条清晰的推进路径"), true);
    } else if (command == QLatin1String("working")) {
        setState(QStringLiteral("focused"), QStringLiteral("正在工作"),
                 QStringLiteral("专注执行中"),
                 QStringLiteral("一步一步把事情做好"), true);
    } else if (command == QLatin1String("waiting")) {
        setState(QStringLiteral("waiting"), QStringLiteral("等待你的回应"),
                 QStringLiteral("需要一点确认"),
                 QStringLiteral("我在听，请告诉我下一步"), true);
    } else if (command == QLatin1String("complete")
               || (command == QLatin1String("activity")
                   && parts.size() == 2 && parts.value(1) == QLatin1String("complete"))) {
        setState(QStringLiteral("happy"), QStringLiteral("工作完成"),
                 QStringLiteral("已经完成了"),
                 QStringLiteral("这一步做得很好，准备继续下一件"), true);
        if (!suppressed())
            m_completionTimer.start();
    } else if (command == QLatin1String("activity")) {
        static const QJsonArray activities = [] {
            QFile file(QStringLiteral(":/assets/eyes/manifest.json"));
            if (!file.open(QIODevice::ReadOnly))
                return QJsonArray{};
            return QJsonDocument::fromJson(file.readAll()).object()
                .value(QStringLiteral("activities")).toArray();
        }();
        QJsonObject activity;
        if (parts.size() == 2) {
            for (const QJsonValue &value : activities) {
                if (value.toObject().value(QStringLiteral("id")).toString() == parts[1]) {
                    activity = value.toObject();
                    break;
                }
            }
        }
        if (activity.isEmpty()) {
            return {{QStringLiteral("ok"), false},
                    {QStringLiteral("error"), QStringLiteral("usage: activity <known-id>")}};
        }
        setState(parts[1], QStringLiteral("Eyes 工作状态"),
                 activity.value(QStringLiteral("name")).toString(),
                 activity.value(QStringLiteral("description")).toString(), true);
    } else if (command == QLatin1String("idle")) {
        setState(QStringLiteral("idle"), QStringLiteral("Eyes 在线"),
                 QStringLiteral("自在待命"),
                 QStringLiteral("收到任务后，我会重新出现"), false);
        setShown(false);
    } else if (command == QLatin1String("show")) {
        showForUser();
    } else if (command == QLatin1String("hide")) {
        hideForUser();
    } else if (command == QLatin1String("toggle")) {
        if (m_shown)
            hideForUser();
        else
            showForUser();
    } else if (command == QLatin1String("blink")) {
        playAction({
            {QStringLiteral("action"), QStringLiteral("blink")},
            {QStringLiteral("double"),
             parts.value(1).compare(QLatin1String("double"),
                                    Qt::CaseInsensitive)
                 == 0},
        });
    } else if (command == QLatin1String("look")) {
        bool xOk = false;
        bool yOk = false;
        bool durationOk = true;
        const double x = parts.value(1).toDouble(&xOk);
        const double y = parts.value(2).toDouble(&yOk);
        const double duration =
            parts.size() > 3 ? parts.value(3).toDouble(&durationOk) : 1.8;
        if (!xOk || !yOk || !durationOk || !std::isfinite(x)
            || !std::isfinite(y) || !std::isfinite(duration)
            || duration < 0.05 || duration > 30) {
            return {
                {QStringLiteral("ok"), false},
                {QStringLiteral("error"),
                 QStringLiteral("usage: look <x:-1..1> <y:-1..1> [seconds]")},
            };
        }
        playAction({
            {QStringLiteral("action"), QStringLiteral("look")},
            {QStringLiteral("x"), x},
            {QStringLiteral("y"), y},
            {QStringLiteral("duration"), duration},
        });
    } else if (command == QLatin1String("emotion")) {
        static const QSet<QString> allowed = {
            QStringLiteral("idle"),     QStringLiteral("happy"),
            QStringLiteral("curious"),  QStringLiteral("thinking"),
            QStringLiteral("focused"),  QStringLiteral("surprised"),
            QStringLiteral("sleepy"),   QStringLiteral("confused"),
        };
        const QString emotion = parts.value(1).toLower();
        if (!allowed.contains(emotion)) {
            return {
                {QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("unknown emotion")},
            };
        }
        setState(emotion, QStringLiteral("Eyes 神态"),
                 QStringLiteral("正在表达"),
                 QStringLiteral("当前神态：%1").arg(emotion), true);
    } else if (command == QLatin1String("status")) {
        // Status is intentionally read-only.
    } else if (command == QLatin1String("demo")) {
        if (!suppressed())
            Q_EMIT demoRequested();
    } else if (command == QLatin1String("quit")) {
        m_suppressionReason = QStringLiteral("quit");
        if (!persistUserSuppression(m_suppressionReason))
            qWarning() << "Eyes: unable to persist the user-quit state";
        setShown(false);
        QTimer::singleShot(80, this, &EyesService::quitRequested);
    } else {
        return {
            {QStringLiteral("ok"), false},
            {QStringLiteral("error"),
             QStringLiteral("unknown command: %1").arg(command)},
        };
    }

    return {
        {QStringLiteral("ok"), true},
        {QStringLiteral("visible"), m_shown},
        {QStringLiteral("suppressed"), suppressed()},
        {QStringLiteral("motion"), m_state.motion},
        {QStringLiteral("title"), m_state.title},
    };
}

class WallpaperBridge final : public QObject
{
    Q_OBJECT

public:
    explicit WallpaperBridge(EyesService *service, QObject *parent = nullptr)
        : QObject(parent)
        , m_service(service)
        , m_server(QStringLiteral("Eyes wallpaper bridge"),
                   QWebSocketServer::NonSecureMode, this)
    {
        connect(&m_server, &QWebSocketServer::newConnection, this, [this] {
            while (QWebSocket *socket = m_server.nextPendingConnection())
                addSocket(socket);
        });
        connect(m_service, &EyesService::stateChanged, this, [this] {
            broadcast({
                {QStringLiteral("type"), QStringLiteral("state")},
                {QStringLiteral("state"),
                 QJsonObject::fromVariantMap(m_service->stateMap())},
            });
        });
        connect(m_service, &EyesService::shownChanged, this, [this] {
            broadcast({
                {QStringLiteral("type"), QStringLiteral("visible")},
                {QStringLiteral("visible"), m_service->shown()},
            });
        });
        connect(m_service, &EyesService::attentionChanged, this, [this] {
            for (QWebSocket *socket : std::as_const(m_sockets))
                sendAttention(socket);
        });
        connect(m_service, &EyesService::actionTriggered, this,
                [this](const QJsonObject &action) {
                    broadcast(action);
                });
    }

    ~WallpaperBridge() override
    {
        // Socket destruction can emit disconnected after the member list dies.
        for (QWebSocket *socket : std::as_const(m_sockets))
            QObject::disconnect(socket, nullptr, this, nullptr);
        m_server.close();
    }

    bool start()
    {
        if (m_server.listen(QHostAddress::LocalHost, kBridgePort))
            return true;
        qWarning().noquote()
            << "Unable to start Eyes wallpaper bridge on port"
            << kBridgePort << ":" << m_server.errorString();
        return false;
    }

private:
    void addSocket(QWebSocket *socket)
    {
        const QString screenName =
            QUrlQuery(socket->requestUrl())
                .queryItemValue(QStringLiteral("screen"));
        socket->setProperty("eyesScreenName", screenName);
        m_sockets.append(socket);
        qInfo().noquote()
            << "Eyes: Plasma wallpaper connected to the state bridge"
            << (screenName.isEmpty() ? QStringLiteral("(unknown screen)")
                                     : screenName);
        connect(socket, &QWebSocket::disconnected, this,
                [this, socket] {
                    m_sockets.removeAll(socket);
                    socket->deleteLater();
                    qInfo().noquote()
                        << "Eyes: Plasma wallpaper disconnected from the state bridge";
                });
        connect(socket, &QWebSocket::textMessageReceived, socket,
                [this, socket](const QString &message) {
                    if (message == QLatin1String("ping"))
                        socket->sendTextMessage(QStringLiteral("pong"));
                    else if (message == QLatin1String("snapshot"))
                        sendSnapshot(socket);
                });

        sendSnapshot(socket);
    }

    void sendSnapshot(QWebSocket *socket)
    {
        socket->sendTextMessage(jsonString({
            {QStringLiteral("type"), QStringLiteral("snapshot")},
            {QStringLiteral("visible"), m_service->shown()},
            {QStringLiteral("state"),
             QJsonObject::fromVariantMap(m_service->stateMap())},
            {QStringLiteral("attention"), attentionFor(socket)},
        }));
    }

    QJsonObject attentionFor(const QWebSocket *socket) const
    {
        const QString screenName =
            socket->property("eyesScreenName").toString();
        QScreen *target = QGuiApplication::primaryScreen();
        if (!screenName.isEmpty()) {
            for (QScreen *screen : QGuiApplication::screens()) {
                if (screen->name() == screenName) {
                    target = screen;
                    break;
                }
            }
        }

        QPoint local = m_service->attentionPosition();
        if (target) {
            const QRect bounds = target->geometry();
            local = QPoint(
                std::clamp(local.x() - bounds.x(), 0,
                           std::max(0, bounds.width() - 1)),
                std::clamp(local.y() - bounds.y(), 0,
                           std::max(0, bounds.height() - 1)));
        }
        return {
            {QStringLiteral("x"), local.x()},
            {QStringLiteral("y"), local.y()},
            {QStringLiteral("active"),
             m_service->shown() && m_service->hasPointerPosition()},
        };
    }

    void sendAttention(QWebSocket *socket)
    {
        socket->sendTextMessage(jsonString({
            {QStringLiteral("type"), QStringLiteral("attention")},
            {QStringLiteral("attention"), attentionFor(socket)},
        }));
    }

    void broadcast(const QJsonObject &message)
    {
        const QString encoded = jsonString(message);
        for (QWebSocket *socket : std::as_const(m_sockets))
            socket->sendTextMessage(encoded);
    }

    static QString jsonString(const QJsonObject &object)
    {
        return QString::fromUtf8(
            QJsonDocument(object).toJson(QJsonDocument::Compact));
    }

    EyesService *m_service;
    QWebSocketServer m_server;
    QList<QWebSocket *> m_sockets;
};

class WallpaperController final : public QObject
{
    Q_OBJECT

public:
    explicit WallpaperController(EyesService *service, QObject *parent = nullptr)
        : QObject(parent)
        , m_service(service)
    {
        if (qEnvironmentVariableIsSet("EYES_DISABLE_WALLPAPER_GUARD"))
            return;
        const QByteArray configured =
            qgetenv("XDG_CONFIG_HOME").trimmed();
        const QString configHome = !configured.isEmpty()
            ? QFile::decodeName(configured)
            : QDir::home().filePath(QStringLiteral(".config"));
        m_configPath =
            QDir(configHome).filePath(
                QStringLiteral("plasma-org.kde.plasma.desktop-appletsrc"));
        const QByteArray explicitScript =
            qgetenv("EYES_CONFIGURE_PLASMA_WALLPAPER");
        QStringList candidates;
        if (!explicitScript.trimmed().isEmpty())
            candidates.append(QFile::decodeName(explicitScript));
        const QString found = QStandardPaths::locate(
            QStandardPaths::GenericDataLocation,
            QStringLiteral("eyes/configure-plasma-wallpaper.py"));
        if (!found.isEmpty())
            candidates.append(found);
        candidates.append(
            QDir(QCoreApplication::applicationDirPath())
                .absoluteFilePath(
                    QStringLiteral("../packaging/configure-plasma-wallpaper.py")));
        candidates.append(
            QDir(QCoreApplication::applicationDirPath())
                .absoluteFilePath(
                    QStringLiteral("../share/eyes/configure-plasma-wallpaper.py")));
        for (const QString &candidate : std::as_const(candidates)) {
            if (QFileInfo(candidate).isFile()) {
                m_scriptPath = QFileInfo(candidate).absoluteFilePath();
                break;
            }
        }

        m_retryTimer.setSingleShot(true);
        m_retryTimer.setInterval(1800);
        connect(&m_retryTimer, &QTimer::timeout, this, [this] {
            if (!m_running && m_hasDesired)
                startDesired();
        });
        m_restoreDelay.setSingleShot(true);
        m_restoreDelay.setInterval(850);
        connect(&m_restoreDelay, &QTimer::timeout, this,
                [this] { startDesired(); });
        connect(m_service, &EyesService::shownChanged, this, [this] {
            request(m_service->shown());
        });

        // A clean startup repairs a crash or an old permanent mount before
        // the first explicit show request arrives.
        QTimer::singleShot(0, this, [this] {
            m_desiredKind = Operation::Restore;
            m_hasDesired = true;
            startDesired();
        });
    }

    void restoreBlocking()
    {
        if (m_scriptPath.isEmpty() || !QFileInfo::exists(m_configPath))
            return;
        if (m_restoredSinceShown && !m_running)
            return;
        m_restoreDelay.stop();
        m_retryTimer.stop();
        if (m_process) {
            QProcess *active = m_process;
            active->disconnect(this);
            if (!active->waitForFinished(4000)) {
                active->kill();
                active->waitForFinished(1000);
            }
            active->deleteLater();
            m_process = nullptr;
            m_running = false;
        }
        runBlocking(Operation::Restore);
    }

private:
    enum class Operation { Mount, Restore };

    static QString modeArgument(Operation operation)
    {
        return operation == Operation::Mount
            ? QStringLiteral("--mount")
            : QStringLiteral("--restore");
    }

    static QString describe(Operation operation)
    {
        return operation == Operation::Mount
            ? QStringLiteral("mount")
            : QStringLiteral("restore");
    }

    void request(bool shown)
    {
        if (m_scriptPath.isEmpty() || !QFileInfo::exists(m_configPath))
            return;
        m_retryTimer.stop();
        m_restoreDelay.stop();
        m_desiredKind = shown ? Operation::Mount : Operation::Restore;
        m_hasDesired = true;
        if (shown) {
            m_restoredSinceShown = false;
            startDesired();
        } else {
            // Let the QML reveal finish before replacing the wallpaper plugin.
            m_restoreDelay.start();
        }
    }

    QStringList operationArguments(Operation operation) const
    {
        QStringList arguments = {
            m_scriptPath,
            QStringLiteral("--config"),
            m_configPath,
            QStringLiteral("--json"),
            QStringLiteral("--activate-runtime"),
            modeArgument(operation),
        };
        if (operation == Operation::Restore)
            arguments.append(QStringLiteral("--recover-legacy"));
        return arguments;
    }

    void startDesired()
    {
        if (!m_hasDesired || m_running || m_scriptPath.isEmpty()
            || !QFileInfo::exists(m_configPath))
            return;
        if (m_desiredKind == Operation::Restore && m_restoreDelay.isActive())
            return;
        m_running = true;
        m_runningKind = m_desiredKind;
        auto *process = new QProcess(this);
        m_process = process;
        connect(process, qOverload<int, QProcess::ExitStatus>(
                    &QProcess::finished),
                this, [this, process](int exitCode,
                                      QProcess::ExitStatus status) {
                    const QByteArray output =
                        process->readAllStandardOutput().trimmed();
                    const QByteArray errors =
                        process->readAllStandardError().trimmed();
                    m_process = nullptr;
                    m_running = false;
                    process->deleteLater();

                    const QJsonObject result =
                        QJsonDocument::fromJson(output).object();
                    if (status != QProcess::NormalExit || exitCode != 0
                        || !result.value(QStringLiteral("ok")).toBool()) {
                        qWarning().noquote()
                            << "Eyes: unable to"
                            << describe(m_runningKind)
                            << "the Plasma wallpaper; retrying"
                            << (!errors.isEmpty() ? errors : output);
                        m_retryTimer.start();
                        return;
                    }

                    if (m_runningKind == Operation::Mount) {
                        m_restoredSinceShown = false;
                        if (result.value(QStringLiteral("changed")).toBool()) {
                            qInfo().noquote()
                                << "Eyes: wallpaper mounted with the original "
                                   "Plasma settings preserved";
                        }
                    } else {
                        m_restoredSinceShown = true;
                        if (result.value(QStringLiteral("changed")).toBool()) {
                            qInfo().noquote()
                                << "Eyes: original Plasma wallpaper restored";
                        }
                    }
                    if (m_hasDesired && m_desiredKind != m_runningKind)
                        startDesired();
                });
        connect(process, &QProcess::errorOccurred, this,
                [this](QProcess::ProcessError error) {
                    if (error == QProcess::FailedToStart && m_process) {
                        m_process->deleteLater();
                        m_process = nullptr;
                        m_running = false;
                        m_retryTimer.start();
                    }
                });

        process->start(QStringLiteral("python3"),
                       operationArguments(m_runningKind),
                       QIODevice::ReadOnly);
    }

    void runBlocking(Operation operation)
    {
        QProcess process;
        process.start(QStringLiteral("python3"), operationArguments(operation),
                      QIODevice::ReadOnly);
        if (!process.waitForStarted(3000)
            || !process.waitForFinished(15000)) {
            process.kill();
            process.waitForFinished(1000);
            qWarning().noquote()
                << "Eyes: unable to" << describe(operation)
                << "the Plasma wallpaper before exit";
            return;
        }
        const QByteArray output = process.readAllStandardOutput().trimmed();
        const QJsonObject result = QJsonDocument::fromJson(output).object();
        const bool ok = process.exitStatus() == QProcess::NormalExit
            && process.exitCode() == 0
            && result.value(QStringLiteral("ok")).toBool();
        if (!ok) {
            const QByteArray errors =
                process.readAllStandardError().trimmed();
            qWarning().noquote()
                << "Eyes: unable to" << describe(operation)
                << "the Plasma wallpaper before exit"
                << (!errors.isEmpty() ? errors : output);
            return;
        }
        m_restoredSinceShown = operation == Operation::Restore;
        if (result.value(QStringLiteral("changed")).toBool()) {
            qInfo().noquote()
                << (operation == Operation::Restore
                        ? "Eyes: original Plasma wallpaper restored"
                        : "Eyes: wallpaper mounted with the original Plasma "
                          "settings preserved");
        }
    }

    EyesService *m_service;
    QString m_configPath;
    QString m_scriptPath;
    QTimer m_restoreDelay;
    QTimer m_retryTimer;
    QPointer<QProcess> m_process;
    bool m_running = false;
    bool m_hasDesired = false;
    bool m_restoredSinceShown = false;
    Operation m_desiredKind = Operation::Restore;
    Operation m_runningKind = Operation::Restore;
};

class DesktopApplication final : public QObject
{
    Q_OBJECT

public:
    explicit DesktopApplication(QApplication *application,
                                QObject *parent = nullptr)
        : QObject(parent)
        , m_application(application)
    {
        m_socketPath = runtimeSocketPath();
        m_lockFile =
            std::make_unique<QLockFile>(m_socketPath + QStringLiteral(".lock"));
        if (!tryBecomePrimary()) {
            QTimer::singleShot(0, m_application, &QCoreApplication::quit);
            return;
        }

        m_wallpaperBridge = new WallpaperBridge(&m_service, this);
        if (!m_wallpaperBridge->start()) {
            qWarning() << "Eyes bridge is busy; retrying without leaving the host idle";
            m_bridgeRetryTimer.setSingleShot(true);
            m_bridgeRetryTimer.setInterval(1200);
            connect(&m_bridgeRetryTimer, &QTimer::timeout, this, [this] {
                if (m_wallpaperBridge->start())
                    m_bridgeRetryTimer.stop();
                else
                    m_bridgeRetryTimer.start();
            });
            m_bridgeRetryTimer.start();
        }

        if (!setupSocketServer()) {
            // A stale owner or a concurrently starting service will release
            // the lock shortly. Keep trying so a transient race never leaves
            // Plasma connected to a dead bridge.
            m_socketRetryTimer.setSingleShot(true);
            m_socketRetryTimer.setInterval(1200);
            connect(&m_socketRetryTimer, &QTimer::timeout, this, [this] {
                if (setupSocketServer())
                    m_socketRetryTimer.stop();
                else
                    m_socketRetryTimer.start();
            });
            m_socketRetryTimer.start();
        }

        setupCursorDBus();
        setupTray();
        m_wallpaperController = new WallpaperController(&m_service, this);

        connect(&m_service, &EyesService::quitRequested, this, [this] {
            m_demoTimer.stop();
            if (m_wallpaperController)
                m_wallpaperController->restoreBlocking();
            QTimer::singleShot(0, m_application, &QCoreApplication::quit);
        });
        connect(&m_service, &EyesService::demoRequested,
                this, &DesktopApplication::playDemo);
        m_demoTimer.setInterval(3400);
        connect(&m_demoTimer, &QTimer::timeout, this, [this] {
            if (++m_demoIndex >= m_demoCommands.size()) {
                m_demoTimer.stop();
                return;
            }
            m_service.applyCommand(m_demoCommands[m_demoIndex]);
            if (m_demoIndex == m_demoCommands.size() - 1)
                m_demoTimer.stop();
        });
        connect(m_application, &QCoreApplication::aboutToQuit, this, [this] {
            if (m_wallpaperController)
                m_wallpaperController->restoreBlocking();
            if (m_server) {
                m_server->close();
                QLocalServer::removeServer(m_socketPath);
            }
        });
    }

    bool isPrimary() const { return m_primary; }
    void showOverlay() { m_service.applyCommand(QStringLiteral("show")); }
    void playDemo();

private:
    bool tryBecomePrimary()
    {
        if (!m_lockFile->tryLock(80))
            return false;
        m_primary = true;
        QLocalServer::removeServer(m_socketPath);
        return true;
    }

    bool setupSocketServer()
    {
        if (m_server)
            return true;
        m_server = new QLocalServer(this);
        m_server->setSocketOptions(QLocalServer::UserAccessOption);
        if (!m_server->listen(m_socketPath)) {
            qWarning().noquote() << "Unable to listen on" << m_socketPath
                                 << ":" << m_server->errorString();
            delete m_server;
            m_server = nullptr;
            return false;
        }

        connect(m_server, &QLocalServer::newConnection, this, [this] {
            while (QLocalSocket *socket = m_server->nextPendingConnection()) {
                auto *buffer = new QByteArray;
                connect(socket, &QLocalSocket::readyRead, socket,
                        [this, socket, buffer] {
                            buffer->append(socket->readAll());
                            if (!buffer->contains('\n'))
                                return;
                            const QByteArray line =
                                buffer->left(buffer->indexOf('\n'));
                            buffer->clear();
                            if (line.trimmed() != "status")
                                m_demoTimer.stop();
                            const QJsonObject response = m_service.applyCommand(
                                QString::fromUtf8(line));
                            socket->write(
                                QJsonDocument(response).toJson(
                                    QJsonDocument::Compact)
                                + '\n');
                            socket->disconnectFromServer();
                        });
                connect(socket, &QLocalSocket::disconnected, socket,
                        [socket, buffer] {
                            delete buffer;
                            socket->deleteLater();
                        });
            }
        });
        return true;
    }

    void setupCursorDBus()
    {
        QDBusConnection bus = QDBusConnection::sessionBus();
        if (!bus.isConnected())
            return;
        bus.registerService(QStringLiteral("org.eyes.Desktop"));
        bus.registerObject(QStringLiteral("/Cursor"), &m_service,
                           QDBusConnection::ExportAllSlots);
    }

    void setupTray()
    {
        if (!QSystemTrayIcon::isSystemTrayAvailable())
            return;
        m_tray = new QSystemTrayIcon(
            QIcon(QStringLiteral(":/desktop/eyes-tray.svg")), this);
        m_tray->setToolTip(QStringLiteral("Eyes"));
        auto *menu = new QMenu;
        menu->addAction(QStringLiteral("显示双眼"), this,
                        [this] {
                            m_demoTimer.stop();
                            m_service.applyCommand(QStringLiteral("show"));
                        });
        menu->addAction(QStringLiteral("隐藏 Eyes"), this,
                        [this] {
                            m_demoTimer.stop();
                            m_service.applyCommand(QStringLiteral("hide"));
                        });
        menu->addSeparator();
        menu->addAction(QStringLiteral("预览完整工作周期"), this,
                        [this] {
                            m_service.applyCommand(QStringLiteral("show"));
                            playDemo();
                        });
        menu->addSeparator();
        menu->addAction(QStringLiteral("退出"), this, [this] {
            m_demoTimer.stop();
            m_service.applyCommand(QStringLiteral("quit"));
        });
        m_tray->setContextMenu(menu);
        connect(m_tray, &QSystemTrayIcon::activated, this,
                [this](QSystemTrayIcon::ActivationReason reason) {
                    if (reason == QSystemTrayIcon::Trigger)
                        m_demoTimer.stop();
                    if (reason == QSystemTrayIcon::Trigger)
                        m_service.applyCommand(QStringLiteral("toggle"));
                });
        m_tray->show();
    }

    QApplication *m_application;
    bool m_primary = false;
    QString m_socketPath;
    std::unique_ptr<QLockFile> m_lockFile;
    QLocalServer *m_server = nullptr;
    QTimer m_bridgeRetryTimer;
    QTimer m_socketRetryTimer;
    EyesService m_service;
    WallpaperBridge *m_wallpaperBridge = nullptr;
    QSystemTrayIcon *m_tray = nullptr;
    WallpaperController *m_wallpaperController = nullptr;
    QTimer m_demoTimer;
    QStringList m_demoCommands;
    int m_demoIndex = 0;
};

void DesktopApplication::playDemo()
{
    m_demoTimer.stop();
    m_demoCommands.clear();
    const QStringList order = {QStringLiteral("listening"), QStringLiteral("planning"),
        QStringLiteral("reading"), QStringLiteral("searching"), QStringLiteral("skill"),
        QStringLiteral("creating"), QStringLiteral("editing"), QStringLiteral("running"),
        QStringLiteral("mcp"), QStringLiteral("tool"), QStringLiteral("delegating"),
        QStringLiteral("testing"), QStringLiteral("blocked"), QStringLiteral("debugging"),
        QStringLiteral("waiting"), QStringLiteral("retrying"), QStringLiteral("reviewing"),
        QStringLiteral("saving"), QStringLiteral("summarizing"), QStringLiteral("complete")};
    for (const QString &activity : order)
        m_demoCommands.append(QStringLiteral("activity ") + activity);
    m_demoIndex = 0;
    m_service.applyCommand(m_demoCommands.front());
    m_demoTimer.start();
}

} // namespace

int main(int argc, char *argv[])
{
    QApplication application(argc, argv);
    QApplication::setApplicationName(QStringLiteral("eyes-desktop"));
    QApplication::setApplicationDisplayName(QStringLiteral("Eyes"));
    QApplication::setOrganizationName(QStringLiteral("Eyes"));
    QApplication::setQuitOnLastWindowClosed(false);

    QCommandLineParser parser;
    parser.setApplicationDescription(
        QStringLiteral("Eyes wallpaper-state host for the agent harness"));
    parser.addHelpOption();
    parser.addVersionOption();
    const QCommandLineOption hiddenOption(
        QStringLiteral("hidden"),
        QStringLiteral("Start without showing the material."));
    const QCommandLineOption previewOption(
        QStringLiteral("preview"),
        QStringLiteral("Show the material immediately."));
    parser.addOption(hiddenOption);
    parser.addOption(previewOption);
    parser.process(application);

    DesktopApplication desktop(&application);
    if (!desktop.isPrimary())
        return 0;

    if (parser.isSet(previewOption))
        desktop.showOverlay();
    else if (!parser.isSet(hiddenOption))
        desktop.showOverlay();

    return application.exec();
}

#include "main.moc"
