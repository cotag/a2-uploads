module.exports = function () {
    var root = '',
        build = root + 'dist/',
        coverage = root + 'coverage/',
        src = root + 'src/',
        config = root + 'config/',
        app = src + 'app/',
        assets = src + 'assets/',
        index = src + 'index.html';

    var gulpConfig = {
        root: root,
        config: config,
        src: src,
        app: app,
        build: build,
        coverage: coverage,
        index: index,
        assets: assets
    };

    return gulpConfig;
};
