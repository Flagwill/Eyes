// Run the same QML scene with either renderer build. GPU timestamps include
// vector drawing, MSAA resolves, SMAA and final Qt Quick composition.
#include <QElapsedTimer>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickGraphicsConfiguration>
#include <QQuickView>
#include <QQmlError>
#include <QSGRendererInterface>
#include <QTimer>
#include <private/qrhi_p.h>
#include <algorithm>
#include <cstdio>
#include <mutex>
#include <numeric>
#include <vector>

int main(int argc, char **argv)
{
    QGuiApplication app(argc, argv);
    if (argc != 2) {
        std::fprintf(stderr, "Usage: eyes-render-benchmark scene.qml\n");
        return 1;
    }
    std::mutex mutex;
    std::vector<double> gpuTimes;
    QElapsedTimer clock;
    clock.start();
    int frames = 0;
    qint64 first = 0, last = 0;
    QString device;
    // Keep callback state alive until the view has joined its render thread.
    QQuickView view;
    QQuickGraphicsConfiguration config;
    config.setTimestamps(true);
    view.setGraphicsConfiguration(config);
    view.setResizeMode(QQuickView::SizeViewToRootObject);
    view.setSource(QUrl::fromLocalFile(QString::fromLocal8Bit(argv[1])));
    if (view.status() == QQuickView::Error) {
        for (const auto &error : view.errors())
            std::fprintf(stderr, "%s\n", qPrintable(error.toString()));
        return 1;
    }

    const auto timingConnection = QObject::connect(&view, &QQuickWindow::afterRendering, &view, [&] {
        const auto now = clock.elapsed();
        if (now < 2000)
            return;
        auto *ri = view.rendererInterface();
        auto *rhi = static_cast<QRhi *>(ri->getResource(&view, QSGRendererInterface::RhiResource));
        auto *swapchain = static_cast<QRhiSwapChain *>(ri->getResource(&view, QSGRendererInterface::RhiSwapchainResource));
        if (!rhi || !swapchain)
            return;
        std::lock_guard lock(mutex);
        device = QString::fromUtf8(rhi->driverInfo().deviceName);
        if (!first) first = now;
        last = now;
        frames++;
        const double gpuMs = swapchain->currentFrameCommandBuffer()->lastCompletedGpuTime() * 1000;
        if (gpuMs > 0) gpuTimes.push_back(gpuMs);
    }, Qt::DirectConnection);
    QTimer::singleShot(14000, &app, &QCoreApplication::quit);
    view.show();
    app.exec();
    QObject::disconnect(timingConnection);
    std::lock_guard lock(mutex);
    if (gpuTimes.empty()) {
        std::fprintf(stderr, "No GPU timestamps available; no GPU result reported.\n");
        return 2;
    }
    std::sort(gpuTimes.begin(), gpuTimes.end());
    const QJsonObject result {
        {"device", device}, {"frames", frames}, {"gpu_samples", int(gpuTimes.size())},
        {"width", view.width()}, {"height", view.height()}, {"dpr", view.devicePixelRatio()},
        {"fps", 1000.0 * (frames - 1) / std::max<qint64>(1, last - first)},
        {"gpu_mean_ms", std::accumulate(gpuTimes.begin(), gpuTimes.end(), 0.0) / gpuTimes.size()},
        {"gpu_median_ms", gpuTimes[gpuTimes.size() / 2]},
        {"gpu_p95_ms", gpuTimes[gpuTimes.size() * 95 / 100]}
    };
    std::puts(QJsonDocument(result).toJson(QJsonDocument::Compact).constData());
}
