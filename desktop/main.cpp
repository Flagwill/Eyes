#include <QApplication>
#include <QBuffer>
#include <QCommandLineOption>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QCursor>
#include <QDBusConnection>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QFileSystemWatcher>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalServer>
#include <QLocalSocket>
#include <QLockFile>
#include <QMenu>
#include <QPointer>
#include <QQmlApplicationEngine>
#include <QQuickView>
#include <QRegularExpression>
#include <QScreen>
#include <QSet>
#include <QSettings>
#include <QStandardPaths>
#include <QSystemTrayIcon>
#include <QTimer>
#include <QUrlQuery>
#include <QWebEngineUrlRequestJob>
#include <QWebEngineUrlScheme>
#include <QWebEngineUrlSchemeHandler>
#include <QtWebEngineQuick/QQuickWebEngineProfile>
#include <QtWebEngineQuick/QtWebEngineQuick>

#include <LayerShellQt/Window>

#include <algorithm>
#include <cmath>
#include <memory>

namespace {

constexpr auto kSocketName = "mio-eyes.sock";
constexpr auto kPlasmaConfig = "plasma-org.kde.plasma.desktop-appletsrc";

QString runtimeSocketPath()
{
    QString directory = QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation);
    if (directory.isEmpty())
        directory = QDir::tempPath();
    return QDir(directory).filePath(QString::fromLatin1(kSocketName));
}

QString localPathFromValue(QString value)
{
    value = value.trimmed();
    if (value.isEmpty())
        return {};
    if (value.startsWith(QLatin1String("file:"))) {
        const QUrl url(value);
        return url.isLocalFile() ? url.toLocalFile() : QString();
    }
    if (value.startsWith(QLatin1String("~/")))
        return QDir::home().filePath(value.mid(2));
    if (QDir::isAbsolutePath(value))
        return value;
    return {};
}

class WallpaperResolver
{
public:
    WallpaperResolver()
        : m_configPath(QDir(QStandardPaths::writableLocation(
                                QStandardPaths::GenericConfigLocation))
                           .filePath(QString::fromLatin1(kPlasmaConfig)))
    {
        reload();
    }

    QString configPath() const { return m_configPath; }

    bool reload()
    {
        QMap<int, QString> nextImages;
        QString nextFallback;
        QSettings settings(m_configPath, QSettings::IniFormat);

        settings.beginGroup(QStringLiteral("Containments"));
        const QStringList containmentIds = settings.childGroups();
        for (const QString &id : containmentIds) {
            settings.beginGroup(id);
            const QString plugin =
                settings.value(QStringLiteral("wallpaperplugin")).toString();
            const int screen =
                settings.value(QStringLiteral("lastScreen"), -1).toInt();
            const QString image =
                settings.value(QStringLiteral("Wallpaper/%1/General/Image")
                                   .arg(plugin))
                    .toString();
            settings.endGroup();

            const QString path = localPathFromValue(image);
            if (path.isEmpty() || !QFileInfo::exists(path))
                continue;
            if (screen >= 0)
                nextImages.insert(screen, path);
            if (nextFallback.isEmpty())
                nextFallback = path;
        }
        settings.endGroup();

        const bool changed = nextImages != m_images || nextFallback != m_fallback;
        m_images = std::move(nextImages);
        m_fallback = std::move(nextFallback);
        return changed;
    }

    QString forScreen(QScreen *screen) const
    {
        if (!screen)
            return m_fallback;
        const int index = QGuiApplication::screens().indexOf(screen);
        if (index >= 0 && !m_images.value(index).isEmpty())
            return m_images.value(index);
        return m_fallback;
    }

private:
    QString m_configPath;
    QMap<int, QString> m_images;
    QString m_fallback;
};

QByteArray contentTypeForPath(const QString &path)
{
    if (path.endsWith(QLatin1String(".html"), Qt::CaseInsensitive))
        return "text/html; charset=utf-8";
    if (path.endsWith(QLatin1String(".css"), Qt::CaseInsensitive))
        return "text/css; charset=utf-8";
    if (path.endsWith(QLatin1String(".js"), Qt::CaseInsensitive)
        || path.endsWith(QLatin1String(".mjs"), Qt::CaseInsensitive))
        return "text/javascript; charset=utf-8";
    if (path.endsWith(QLatin1String(".svg"), Qt::CaseInsensitive))
        return "image/svg+xml";
    if (path.endsWith(QLatin1String(".png"), Qt::CaseInsensitive))
        return "image/png";
    if (path.endsWith(QLatin1String(".jpg"), Qt::CaseInsensitive)
        || path.endsWith(QLatin1String(".jpeg"), Qt::CaseInsensitive))
        return "image/jpeg";
    if (path.endsWith(QLatin1String(".webp"), Qt::CaseInsensitive))
        return "image/webp";
    return "application/octet-stream";
}

QString normalizedResourcePath(const QUrl &url)
{
    QString path = url.path();
    if (path.isEmpty() || path == QLatin1String("/"))
        path = QStringLiteral("/desktop.html");
    return QStringLiteral(":/") + QDir::cleanPath(path).mid(1);
}

class MioSchemeHandler final : public QWebEngineUrlSchemeHandler
{
public:
    explicit MioSchemeHandler(WallpaperResolver *wallpaper,
                              QObject *parent = nullptr)
        : QWebEngineUrlSchemeHandler(parent)
        , m_wallpaper(wallpaper)
    {
    }

    void requestStarted(QWebEngineUrlRequestJob *job) override
    {
        const QUrl url = job->requestUrl();
        QByteArray data;
        QByteArray type;

        if (url.host() == QLatin1String("app")) {
            const QString sourcePath = normalizedResourcePath(url);
            QFile file(sourcePath);
            if (!file.open(QIODevice::ReadOnly)) {
                job->fail(QWebEngineUrlRequestJob::UrlNotFound);
                return;
            }
            data = file.readAll();
            type = contentTypeForPath(sourcePath);
        } else if (url.host() == QLatin1String("wallpaper")
                   && url.path() == QLatin1String("/current")) {
            const QString screenName =
                QUrlQuery(url).queryItemValue(QStringLiteral("screen"));
            QScreen *target = nullptr;
            for (QScreen *screen : QGuiApplication::screens()) {
                if (screen->name() == screenName) {
                    target = screen;
                    break;
                }
            }
            const QString wallpaperPath = m_wallpaper->forScreen(target);
            QFile file(wallpaperPath);
            if (!wallpaperPath.isEmpty() && file.open(QIODevice::ReadOnly)) {
                data = file.readAll();
                type = contentTypeForPath(wallpaperPath);
            }
        }

        if (data.isEmpty()) {
            job->fail(QWebEngineUrlRequestJob::UrlNotFound);
            return;
        }

        auto *buffer = new QBuffer(job);
        buffer->setData(data);
        buffer->open(QIODevice::ReadOnly);
        job->setAdditionalResponseHeaders({
            {QByteArrayLiteral("Cache-Control"),
             QByteArrayLiteral("no-store, max-age=0")},
            {QByteArrayLiteral("Access-Control-Allow-Origin"),
             QByteArrayLiteral("*")},
            {QByteArrayLiteral("X-Content-Type-Options"),
             QByteArrayLiteral("nosniff")},
        });
        job->reply(type, buffer);
    }

private:
    WallpaperResolver *m_wallpaper;
};

struct AgentState {
    QString motion = QStringLiteral("idle");
    QString eyebrow = QStringLiteral("MIO 在线");
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

class ScreenBridge final : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap state READ state NOTIFY stateChanged)
    Q_PROPERTY(bool shown READ shown NOTIFY shownChanged)
    Q_PROPERTY(int attentionX READ attentionX NOTIFY attentionChanged)
    Q_PROPERTY(int attentionY READ attentionY NOTIFY attentionChanged)
    Q_PROPERTY(bool attentionActive READ attentionActive NOTIFY attentionChanged)
    Q_PROPERTY(QString actionScript READ actionScript NOTIFY actionScriptChanged)
    Q_PROPERTY(int wallpaperRevision READ wallpaperRevision NOTIFY wallpaperRevisionChanged)

public:
    explicit ScreenBridge(QScreen *screen, QObject *parent = nullptr)
        : QObject(parent)
        , m_screen(screen)
    {
    }

    QVariantMap state() const { return m_state; }
    bool shown() const { return m_shown; }
    int attentionX() const { return m_attentionX; }
    int attentionY() const { return m_attentionY; }
    bool attentionActive() const { return m_attentionActive; }
    QString actionScript() const { return m_actionScript; }
    int wallpaperRevision() const { return m_wallpaperRevision; }

    void setState(const QVariantMap &state)
    {
        if (m_state == state)
            return;
        m_state = state;
        Q_EMIT stateChanged();
    }

    void setShown(bool shown)
    {
        if (m_shown == shown)
            return;
        m_shown = shown;
        Q_EMIT shownChanged();
    }

    void setAttention(const QPoint &globalPosition, bool active)
    {
        int x = 0;
        int y = 0;
        if (m_screen) {
            const QRect bounds = m_screen->geometry();
            x = std::clamp(globalPosition.x() - bounds.x(), 0,
                           std::max(0, bounds.width() - 1));
            y = std::clamp(globalPosition.y() - bounds.y(), 0,
                           std::max(0, bounds.height() - 1));
        }
        if (m_attentionX == x && m_attentionY == y
            && m_attentionActive == active)
            return;
        m_attentionX = x;
        m_attentionY = y;
        m_attentionActive = active;
        Q_EMIT attentionChanged();
    }

    void setWallpaperRevision(int revision)
    {
        if (m_wallpaperRevision == revision)
            return;
        m_wallpaperRevision = revision;
        Q_EMIT wallpaperRevisionChanged();
    }

    void playAction(const QString &script)
    {
        ++m_actionSequence;
        m_actionScript = script
            + QStringLiteral(";void 0;/*mio-action-%1*/").arg(m_actionSequence);
        Q_EMIT actionScriptChanged();
    }

signals:
    void stateChanged();
    void shownChanged();
    void attentionChanged();
    void actionScriptChanged();
    void wallpaperRevisionChanged();

private:
    QPointer<QScreen> m_screen;
    QVariantMap m_state;
    bool m_shown = false;
    int m_attentionX = 0;
    int m_attentionY = 0;
    bool m_attentionActive = false;
    QString m_actionScript;
    int m_actionSequence = 0;
    int m_wallpaperRevision = 1;
};

class MioService final : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "com.mio.Eyes")

public:
    explicit MioService(QObject *parent = nullptr)
        : QObject(parent)
        , m_attentionPosition(QCursor::pos())
        , m_pendingPointerPosition(m_attentionPosition)
    {
        m_state.eyebrow = QStringLiteral("MIO 桌面上线");
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
            updateAttention();
        });

        m_fallbackCursorTimer.setInterval(140);
        connect(&m_fallbackCursorTimer, &QTimer::timeout, this, [this] {
            if (m_kwinCursorTimer.isValid() && m_kwinCursorTimer.elapsed() < 700)
                return;
            setPointerPosition(QCursor::pos());
        });
        m_fallbackCursorTimer.start();
    }

    AgentState state() const { return m_state; }
    QVariantMap stateMap() const { return m_state.toMap(); }
    bool shown() const { return m_shown; }

    void addBridge(ScreenBridge *bridge)
    {
        m_bridges.append(bridge);
        bridge->setState(stateMap());
        bridge->setShown(m_shown);
        bridge->setAttention(m_attentionPosition, m_shown);
    }

    void removeBridge(ScreenBridge *bridge) { m_bridges.removeAll(bridge); }

    void setWallpaperRevision(int revision)
    {
        for (ScreenBridge *bridge : std::as_const(m_bridges))
            bridge->setWallpaperRevision(revision);
    }

    void setShown(bool shown)
    {
        if (!shown)
            m_completionTimer.stop();
        if (m_shown == shown)
            return;
        m_shown = shown;
        for (ScreenBridge *bridge : std::as_const(m_bridges)) {
            bridge->setShown(shown);
            bridge->setAttention(m_attentionPosition, shown);
        }
    }

    QJsonObject applyCommand(const QString &line);

public Q_SLOTS:
    void SetPosition(int x, int y)
    {
        m_kwinCursorTimer.restart();
        setPointerPosition(QPoint(x, y));
    }

signals:
    void quitRequested();

private:
    void setState(const QString &motion, const QString &eyebrow,
                  const QString &title, const QString &detail, bool show)
    {
        m_completionTimer.stop();
        m_state = {motion, eyebrow, title, detail};
        for (ScreenBridge *bridge : std::as_const(m_bridges))
            bridge->setState(stateMap());
        if (show)
            setShown(true);
    }

    void playAction(const QString &script)
    {
        setShown(true);
        for (ScreenBridge *bridge : std::as_const(m_bridges))
            bridge->playAction(script);
    }

    void setPointerPosition(const QPoint &position)
    {
        m_pendingPointerPosition = position;
        m_hasPendingPointer = true;
        if (!m_pointerTimer.isActive())
            m_pointerTimer.start();
    }

    void updateAttention()
    {
        for (ScreenBridge *bridge : std::as_const(m_bridges))
            bridge->setAttention(m_attentionPosition, m_shown);
    }

    AgentState m_state;
    bool m_shown = false;
    QList<ScreenBridge *> m_bridges;
    QTimer m_completionTimer;
    QTimer m_pointerTimer;
    QTimer m_fallbackCursorTimer;
    QElapsedTimer m_kwinCursorTimer;
    QPoint m_attentionPosition;
    QPoint m_pendingPointerPosition;
    bool m_hasPendingPointer = false;
};

QJsonObject MioService::applyCommand(const QString &line)
{
    const QString normalized = line.trimmed();
    if (normalized.isEmpty()) {
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("empty command")}};
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
        setState(QStringLiteral("idle"), QStringLiteral("MIO 在线"),
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
        const bool twice =
            parts.value(1).compare(QLatin1String("double"),
                                   Qt::CaseInsensitive) == 0;
        playAction(QStringLiteral("window.mioHost && window.mioHost.blink(%1)")
                       .arg(twice ? QStringLiteral("true")
                                  : QStringLiteral("false")));
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
            return {{QStringLiteral("ok"), false},
                    {QStringLiteral("error"),
                     QStringLiteral("usage: look <x:-1..1> <y:-1..1> [seconds]")}};
        }
        playAction(QStringLiteral("window.mioHost && window.mioHost.look(%1, %2, %3)")
                       .arg(x, 0, 'f', 4)
                       .arg(y, 0, 'f', 4)
                       .arg(duration, 0, 'f', 3));
    } else if (command == QLatin1String("emotion")) {
        static const QSet<QString> allowed = {
            QStringLiteral("idle"),     QStringLiteral("happy"),
            QStringLiteral("curious"),  QStringLiteral("thinking"),
            QStringLiteral("focused"),  QStringLiteral("surprised"),
            QStringLiteral("sleepy"),   QStringLiteral("confused"),
        };
        const QString emotion = parts.value(1).toLower();
        if (!allowed.contains(emotion)) {
            return {{QStringLiteral("ok"), false},
                    {QStringLiteral("error"), QStringLiteral("unknown emotion")}};
        }
        setState(emotion, QStringLiteral("MIO 神态"),
                 QStringLiteral("正在表达"),
                 QStringLiteral("当前神态：%1").arg(emotion), true);
    } else if (command == QLatin1String("status")) {
        // Status is read-only.
    } else if (command == QLatin1String("demo")) {
        setState(QStringLiteral("curious"), QStringLiteral("演示开始"),
                 QStringLiteral("正在理解任务"),
                 QStringLiteral("完整的桌面工作周期预览"), true);
    } else if (command == QLatin1String("quit")) {
        QTimer::singleShot(80, this, &MioService::quitRequested);
    } else {
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"),
                 QStringLiteral("unknown command: %1").arg(command)}};
    }

    return {
        {QStringLiteral("ok"), true},
        {QStringLiteral("visible"), m_shown},
        {QStringLiteral("motion"), m_state.motion},
        {QStringLiteral("title"), m_state.title},
    };
}

class DesktopApplication final : public QObject
{
    Q_OBJECT

public:
    explicit DesktopApplication(QApplication *application, QObject *parent = nullptr)
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

        setupSchemeHandler();
        setupWallpaperWatcher();
        setupScreens();
        setupSocketServer();
        setupCursorDBus();
        setupTray();

        connect(&m_service, &MioService::quitRequested,
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

    void setupSchemeHandler()
    {
        m_profile = QQuickWebEngineProfile::defaultProfile();
        m_profile->setPersistentCookiesPolicy(
            QQuickWebEngineProfile::NoPersistentCookies);
        m_schemeHandler = new MioSchemeHandler(&m_wallpaper, m_profile);
        m_profile->installUrlSchemeHandler(QByteArrayLiteral("mio"),
                                           m_schemeHandler);
        m_engine.addImportPath(QStringLiteral("qrc:/"));
    }

    void setupWallpaperWatcher()
    {
        m_watcher = new QFileSystemWatcher(this);
        if (QFileInfo::exists(m_wallpaper.configPath()))
            m_watcher->addPath(m_wallpaper.configPath());
        m_watcher->addPath(QFileInfo(m_wallpaper.configPath()).absolutePath());
        connect(m_watcher, &QFileSystemWatcher::fileChanged,
                this, [this] { scheduleWallpaperReload(); });
        connect(m_watcher, &QFileSystemWatcher::directoryChanged, this, [this] {
            if (!m_watcher->files().contains(m_wallpaper.configPath())
                && QFileInfo::exists(m_wallpaper.configPath())) {
                m_watcher->addPath(m_wallpaper.configPath());
            }
            scheduleWallpaperReload();
        });
    }

    void scheduleWallpaperReload()
    {
        QTimer::singleShot(220, this, [this] {
            if (!m_watcher->files().contains(m_wallpaper.configPath())
                && QFileInfo::exists(m_wallpaper.configPath())) {
                m_watcher->addPath(m_wallpaper.configPath());
            }
            if (m_wallpaper.reload()) {
                ++m_wallpaperRevision;
                m_service.setWallpaperRevision(m_wallpaperRevision);
            }
        });
    }

    void setupScreens()
    {
        connect(qApp, &QGuiApplication::screenAdded, this,
                [this](QScreen *screen) { createScreenView(screen); });
        connect(qApp, &QGuiApplication::screenRemoved, this,
                [this](QScreen *screen) { removeScreenView(screen); });
        for (QScreen *screen : QGuiApplication::screens())
            createScreenView(screen);
    }

    void createScreenView(QScreen *screen)
    {
        if (!screen || m_views.contains(screen))
            return;

        auto *view = new QQuickView(&m_engine, nullptr);
        auto *bridge = new ScreenBridge(screen, view);
        m_service.addBridge(bridge);
        m_views.insert(screen, view);
        m_bridges.insert(screen, bridge);

        view->setScreen(screen);
        view->setGeometry(screen->geometry());
        view->setColor(Qt::transparent);
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->setFlags(Qt::Tool
                       | Qt::FramelessWindowHint
                       | Qt::NoDropShadowWindowHint
                       | Qt::WindowDoesNotAcceptFocus
                       | Qt::WindowTransparentForInput);
        view->setInitialProperties({
            {QStringLiteral("controller"), QVariant::fromValue(bridge)},
            {QStringLiteral("screenName"), screen->name()},
        });
        view->setSource(QUrl(QStringLiteral("qrc:/desktop/DesktopWindow.qml")));

        LayerShellQt::Window *layer = LayerShellQt::Window::get(view);
        // The override is only for production visual QA; interaction is still
        // fully transparent and normal launches always stay on the background.
        layer->setLayer(
            qEnvironmentVariableIntValue("MIO_LAYER_OVERLAY") == 1
                ? LayerShellQt::Window::LayerOverlay
                : LayerShellQt::Window::LayerBackground);
        layer->setAnchors(LayerShellQt::Window::Anchors(
            LayerShellQt::Window::AnchorTop
            | LayerShellQt::Window::AnchorBottom
            | LayerShellQt::Window::AnchorLeft
            | LayerShellQt::Window::AnchorRight));
        layer->setExclusiveZone(0);
        layer->setKeyboardInteractivity(
            LayerShellQt::Window::KeyboardInteractivityNone);
        layer->setActivateOnShow(false);
        layer->setScope(QStringLiteral("mio-agent-eyes"));
        layer->setScreen(screen);

        connect(screen, &QScreen::geometryChanged, view,
                [view, screen] { view->setGeometry(screen->geometry()); });

        if (view->status() == QQuickView::Error) {
            for (const QQmlError &error : view->errors())
                qWarning().noquote() << error.toString();
        }
        view->show();
    }

    void removeScreenView(QScreen *screen)
    {
        QQuickView *view = m_views.take(screen);
        ScreenBridge *bridge = m_bridges.take(screen);
        if (bridge) {
            m_service.removeBridge(bridge);
            bridge->deleteLater();
        }
        if (view) {
            view->close();
            view->deleteLater();
        }
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
        bus.registerService(QStringLiteral("com.mio.Eyes"));
        bus.registerObject(QStringLiteral("/Cursor"), &m_service,
                           QDBusConnection::ExportAllSlots);
    }

    void setupTray()
    {
        if (!QSystemTrayIcon::isSystemTrayAvailable())
            return;
        m_tray = new QSystemTrayIcon(
            QIcon(QStringLiteral(":/desktop/mio-tray.svg")), this);
        m_tray->setToolTip(QStringLiteral("MIO Agent 双眼"));
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
    QQuickWebEngineProfile *m_profile = nullptr;
    MioSchemeHandler *m_schemeHandler = nullptr;
    QQmlApplicationEngine m_engine;
    WallpaperResolver m_wallpaper;
    QFileSystemWatcher *m_watcher = nullptr;
    int m_wallpaperRevision = 1;
    QHash<QScreen *, QQuickView *> m_views;
    QHash<QScreen *, ScreenBridge *> m_bridges;
    QLocalServer *m_server = nullptr;
    MioService m_service;
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
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);

    QWebEngineUrlScheme scheme(QByteArrayLiteral("mio"));
    scheme.setSyntax(QWebEngineUrlScheme::Syntax::Host);
    scheme.setDefaultPort(
        QWebEngineUrlScheme::SpecialPort::PortUnspecified);
    scheme.setFlags(QWebEngineUrlScheme::SecureScheme
                    | QWebEngineUrlScheme::LocalAccessAllowed
                    | QWebEngineUrlScheme::CorsEnabled
                    | QWebEngineUrlScheme::FetchApiAllowed);
    QWebEngineUrlScheme::registerScheme(scheme);
    QtWebEngineQuick::initialize();

    QApplication application(argc, argv);
    QApplication::setApplicationName(QStringLiteral("mio-desktop"));
    QApplication::setApplicationDisplayName(
        QStringLiteral("MIO Agent 双眼"));
    QApplication::setOrganizationName(QStringLiteral("MIO"));
    QApplication::setQuitOnLastWindowClosed(false);

    QCommandLineParser parser;
    parser.setApplicationDescription(
        QStringLiteral("Desktop eye overlay for the MIO agent harness"));
    parser.addHelpOption();
    parser.addVersionOption();
    const QCommandLineOption hiddenOption(
        QStringLiteral("hidden"),
        QStringLiteral("Start without showing the eyes."));
    const QCommandLineOption previewOption(
        QStringLiteral("preview"),
        QStringLiteral("Show the overlay immediately."));
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
