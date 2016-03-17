"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var condo_api_1 = require('./condo-api');
var upload_1 = require('./upload');
var Google = (function (_super) {
    __extends(Google, _super);
    function Google(api, upload, workers, completeCB) {
        _super.call(this, api, upload, workers, completeCB);
    }
    Google.prototype._start = function () {
        var self = this;
        if (self._strategy === undefined || self.state === upload_1.State.Paused) {
            self.state = upload_1.State.Uploading;
            // Prevents this function being called twice
            self._strategy = null;
            self._processPart(self._file).then(function (result) {
                if (self.state !== upload_1.State.Uploading) {
                    // upload was paused or aborted as we were reading the file
                    return;
                }
                self._api.create({ file_id: result.md5 })
                    .subscribe(function (response) {
                    self._strategy = response.type;
                    if (response.type === 'direct_upload') {
                        self._direct(response, result);
                    }
                    else {
                        self._resume(response, result);
                    }
                }, self._defaultError.bind(self));
            }, self._defaultError.bind(self));
        }
    };
    // Calculates the MD5 of the part of the file we are uploading
    Google.prototype._processPart = function (chunk, part) {
        if (part === void 0) { part = 0; }
        var self = this;
        return self._hashData(part.toString(), function () {
            return chunk;
        }, function (data) {
            // We hash in here as not all cloud providers may use MD5
            var hasher = self._md5Workers.next();
            // Hash the part and return the result
            return hasher.hash(data).then(function (md5) {
                return {
                    md5: window.btoa(condo_api_1.CondoApi.hexToBin(md5)),
                    part: part
                };
            });
        });
    };
    Google.prototype._resume = function (request, firstChunk) {
        var self = this;
        self._api.signedRequest(request).request
            .then(function (xhr) {
            if (request.type === 'status') {
                if (xhr.status === request.expected) {
                    // We need to resume the upload
                    var rangeStart = parseInt(xhr.getResponseHeader('Range').split('-')[1], 10) + 1;
                    self._processPart(self._file.slice(rangeStart), rangeStart).then(function (partInfo) {
                        if (self.state !== upload_1.State.Uploading) {
                            // upload was paused or aborted as we were reading the file
                            return;
                        }
                        self._api.sign(rangeStart, partInfo.md5).
                            subscribe(function (data) {
                            self._performUpload(data, partInfo, rangeStart);
                        }, self._defaultError.bind(self));
                    }, self._defaultError.bind(self));
                }
                else {
                    // The upload is complete
                    self._completeUpload();
                }
            }
            else {
                // We've created the upload - we need to inform our server
                self._api.update({
                    // grab the upload_id from the Location header
                    resumable_id: self._getQueryParams(xhr.getResponseHeader('Location').split('?')[1]).upload_id,
                    file_id: firstChunk.md5,
                    part: 0
                }).subscribe(function (data) {
                    self._performUpload(data, firstChunk, 0);
                }, function (reason) {
                    // We should start from the beginning
                    self._restart();
                    self._defaultError(reason);
                });
            }
        }, self._defaultError.bind(self));
    };
    Google.prototype._performUpload = function (request, partInfo, rangeStart) {
        var self = this, monitor = self._requestWithProgress(partInfo, request);
        monitor.then(function () {
            self._completeUpload();
        }, self._defaultError.bind(self));
    };
    Google.prototype._direct = function (request, partInfo) {
        var self = this, monitor = self._requestWithProgress(partInfo, request);
        self._isDirectUpload = true;
        monitor.then(function () {
            self._completeUpload();
        }, self._defaultError.bind(self));
    };
    Google.prototype._getQueryParams = function (qs) {
        qs = qs.split('+').join(' ');
        var params = {}, tokens, re = /[?&]?([^=]+)=([^&]*)/g;
        // NOTE:: assignment in while loop is deliberate
        while (tokens = re.exec(qs)) {
            params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
        }
        return params;
    };
    Google.lookup = 'GoogleCloudStorage';
    return Google;
}(upload_1.CloudStorage));
exports.Google = Google;
//# sourceMappingURL=google.js.map