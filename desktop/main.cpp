#include <QApplication>
#include <QCommandLineOption>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QCursor>
#include <QDBusConnection>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QGuiApplication>
#include <QHostAddress>
#include <QIcon>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalServer>
#include <QLocalSocket>
#include <QLockFile>
#include <QMenu>
#include <QPointer>
#include <QRegularExpression>
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
        m_fallbackCursorTimer.start();
    }

    AgentState state() const { return m_state; }
    QVariantMap stateMap() const { return m_state.toMap(); }
    bool shown() const { return m_shown; }
    bool hasPointerPosition() const { return m_hasPointerPosition; }
    QPoint attentionPosition() const { return m_attentionPosition; }

    void setShown(bool shown)
    {
        if (!shown)
            m_completionTimer.stop();
        if (m_shown == shown)
            return;
        m_shown = shown;
        Q_EMIT shownChanged();
        Q_EMIT attentionChanged();
    }

    QJsonObject applyCommand(const QString &line);

public Q_SLOTS:
    void SetPosition(int x, int y)
    {
        m_kwinCursorTimer.restart();
        setPointerPosition(QPoint(x, y));
    }

signals:
    void stateChanged();
    void shownChanged();
    void attentionChanged();
    void actionTriggered(const QJsonObject &action);
    void quitRequested();

private:
    void setState(const QString &motion, const QString &eyebrow,
                  const QString &title, const QString &detail, bool show)
    {
        m_completionTimer.stop();
        m_state = {motion, eyebrow, title, detail};
        Q_EMIT stateChanged();
        if (show)
            setShown(true);
    }

    void playAction(QJsonObject action)
    {
        setShown(true);
        action.insert(QStringLiteral("type"), QStringLiteral("action"));
        action.insert(QStringLiteral("sequence"), ++m_actionSequence);
        Q_EMIT actionTriggered(action);
    }

    void setPointerPosition(const QPoint &position)
    {
        m_pendingPointerPosition = position;
        m_hasPendingPointer = true;
        if (!m_pointerTimer.isActive())
            m_pointerTimer.start();
    }

    AgentState m_state;
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
        setState(QStringLiteral("confused"), QStringLiteral("等待你的回应"),
                 QStringLiteral("需要一点确认"),
                 QStringLiteral("我在听，请告诉我下一步"), true);
    } else if (command == QLatin1String("complete")) {
        setState(QStringLiteral("happy"), QStringLiteral("工作完成"),
                 QStringLiteral("已经完成了"),
                 QStringLiteral("这一步做得很好，准备继续下一件"), true);
        m_completionTimer.start();
    } else if (command == QLatin1String("idle")) {
        setState(QStringLiteral("idle"), QStringLiteral("Eyes 在线"),
                 QStringLiteral("自在待命"),
                 QStringLiteral("收到任务后，我会重新出现"), false);
        setShown(false);
    } else if (command == QLatin1String("show")) {
        setShown(true);
    } else if (command == QLatin1String("hide")) {
        setShown(false);
    } else if (command == QLatin1String("toggle")) {
        setShown(!m_shown);
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
        setState(QStringLiteral("curious"), QStringLiteral("演示开始"),
                 QStringLiteral("正在理解任务"),
                 QStringLiteral("完整的桌面工作周期预览"), true);
    } else if (command == QLatin1String("quit")) {
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
        connect(socket, &QWebSocket::disconnected, this,
                [this, socket] {
                    m_sockets.removeAll(socket);
                    socket->deleteLater();
                });
        connect(socket, &QWebSocket::textMessageReceived, socket,
                [socket](const QString &message) {
                    if (message == QLatin1String("ping"))
                        socket->sendTextMessage(QStringLiteral("pong"));
                });

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
            QTimer::singleShot(0, m_application, &QCoreApplication::quit);
            return;
        }

        setupSocketServer();
        setupCursorDBus();
        setupTray();

        connect(&m_service, &EyesService::quitRequested,
                m_application, &QCoreApplication::quit);
        connect(m_application, &QCoreApplication::aboutToQuit, this, [this] {
            if (m_server) {
                m_server->close();
                QLocalServer::removeServer(m_socketPath);
            }
        });
    }

    bool isPrimary() const { return m_primary; }
    void showOverlay() { m_service.setShown(true); }
    void playDemo();

private:
    bool tryBecomePrimary()
    {
        if (!m_lockFile->tryLock(80)) {
            QLocalSocket existing;
            existing.connectToServer(m_socketPath);
            if (existing.waitForConnected(250)) {
                existing.write("show\n");
                existing.waitForBytesWritten(150);
                existing.disconnectFromServer();
            }
            return false;
        }
        m_primary = true;
        QLocalServer::removeServer(m_socketPath);
        return true;
    }

    void setupSocketServer()
    {
        m_server = new QLocalServer(this);
        m_server->setSocketOptions(QLocalServer::UserAccessOption);
        if (!m_server->listen(m_socketPath)) {
            qWarning().noquote() << "Unable to listen on" << m_socketPath
                                 << ":" << m_server->errorString();
            QTimer::singleShot(0, m_application, &QCoreApplication::quit);
            return;
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
                        [this] { m_service.setShown(true); });
        menu->addAction(QStringLiteral("暂时隐藏"), this,
                        [this] { m_service.setShown(false); });
        menu->addSeparator();
        menu->addAction(QStringLiteral("预览完整工作周期"), this,
                        [this] { playDemo(); });
        menu->addSeparator();
        menu->addAction(QStringLiteral("退出"), m_application,
                        &QCoreApplication::quit);
        m_tray->setContextMenu(menu);
        connect(m_tray, &QSystemTrayIcon::activated, this,
                [this](QSystemTrayIcon::ActivationReason reason) {
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
    EyesService m_service;
    WallpaperBridge *m_wallpaperBridge = nullptr;
    QSystemTrayIcon *m_tray = nullptr;
};

void DesktopApplication::playDemo()
{
    struct Step {
        int delay;
        const char *command;
    };
    static const Step steps[] = {
        {0, "start"},
        {2500, "thinking"},
        {5200, "working"},
        {8500, "waiting"},
        {11600, "working"},
        {14500, "complete"},
    };
    for (const Step &step : steps) {
        QTimer::singleShot(step.delay, this,
                           [this, command = QString::fromLatin1(step.command)] {
                               m_service.applyCommand(command);
                           });
    }
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

    if (!parser.isSet(hiddenOption))
        desktop.showOverlay();

    return application.exec();
}

#include "main.moc"
