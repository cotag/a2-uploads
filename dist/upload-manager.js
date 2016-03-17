"use strict";
// Manager imports
var upload_1 = require('./upload');
var UploadManager = (function () {
    function UploadManager(_http, _apiEndpoint, _md5Workers) {
        this._http = _http;
        this._apiEndpoint = _apiEndpoint;
        this._md5Workers = _md5Workers;
        this.uploads = [];
        this.autoStart = true;
        this.autoRemove = false;
        this.removeAfter = 0;
        this.simultaneous = 2; // Uploads
        this.parallel = 3; // Parallel parts of an upload
        this.retries = 4; // Number of times a failed part can occur for an upload
    }
    UploadManager.addProvider = function (provider) {
        upload_1.Upload.provider[provider.lookup] = provider;
    };
    UploadManager.prototype.upload = function (files) {
        var self = this, autostart = self.autoStart, completeCallback = self._uploadComplete.bind(self);
        files.forEach(function (file) {
            var upload = new upload_1.Upload(self._http, self._apiEndpoint, self._md5Workers, file, self.retries, self.parallel);
            self.uploads.push(upload);
            // Apply metadata
            upload.metadata = self.metadata;
            // watch for completion
            upload.promise.then(completeCallback, completeCallback);
            // Only autostart if we under our simultaneous limit
            if (autostart) {
                autostart = self._checkAutostart();
                if (autostart) {
                    upload.resume(self.parallel);
                }
            }
        });
    };
    UploadManager.prototype.pauseAll = function () {
        this.uploads.forEach(function (upload) {
            upload.pause();
        });
    };
    UploadManager.prototype.resumeUpload = function (upload) {
        upload.resume(this.parallel);
    };
    UploadManager.prototype.resumeAll = function () {
        var _this = this;
        this.uploads.forEach(function (upload) {
            upload.resume(_this.parallel);
        });
    };
    UploadManager.prototype.updateMetadata = function (metadata) {
        this.metadata = metadata;
        this.uploads.forEach(function (upload) {
            upload.metadata = metadata;
        });
    };
    UploadManager.prototype.remove = function (upload) {
        var index = this.uploads.indexOf(upload);
        upload.cancel();
        if (index !== -1) {
            this.uploads.splice(index, 1);
        }
    };
    UploadManager.prototype.removeAll = function () {
        this.uploads.forEach(function (upload) {
            upload.cancel();
        });
        this.uploads = [];
    };
    UploadManager.prototype.removeComplete = function () {
        var complete = [], uploads = this.uploads;
        uploads.forEach(function (upload) {
            if (upload.complete) {
                complete.push(upload);
            }
        });
        complete.forEach(function (upload) {
            var index = uploads.indexOf(upload);
            uploads.splice(index, 1);
        });
    };
    UploadManager.prototype._checkAutostart = function () {
        var uploading = 0, length = this.uploads.length, index = 0;
        for (; index < length; index += 1) {
            if (this.uploads[index].uploading) {
                uploading += 1;
                if (uploading >= this.simultaneous) {
                    return false;
                }
            }
        }
        return true;
    };
    UploadManager.prototype._uploadComplete = function (upload) {
        var self = this, index;
        if (self.autoRemove) {
            if (self.removeAfter) {
                setTimeout(function () {
                    self.remove(upload);
                }, self.removeAfter);
            }
            else {
                self.remove(upload);
            }
        }
        if (self.autoStart && self.uploads.length > 0 && self._checkAutostart()) {
            for (index = 0; index < self.uploads.length; index += 1) {
                if (self.uploads[index].isWaiting()) {
                    self.uploads[index].resume(self.parallel);
                    break;
                }
            }
        }
    };
    return UploadManager;
}());
exports.UploadManager = UploadManager;
//# sourceMappingURL=upload-manager.js.map