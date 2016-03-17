"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var condo_api_1 = require('./condo-api');
var upload_1 = require('./upload');
var Azure = (function (_super) {
    __extends(Azure, _super);
    function Azure(api, upload, workers, completeCB) {
        _super.call(this, api, upload, workers, completeCB);
        // 2MB part size
        this._partSize = 2097152;
    }
    Azure.prototype._start = function () {
        var self = this;
        if (self._strategy === undefined) {
            self.state = upload_1.State.Uploading;
            // Prevents this function being called twice
            self._strategy = null;
            // Update part size
            // Not because we have to, no limits as such with openstack
            // This ensures requests don't break any limits on our system
            if ((self._partSize * 50000) < self.size) {
                self._partSize = Math.floor(self.size / 50000);
                // 4MB limit on part sizes
                if (self._partSize > (4 * 1024 * 1024)) {
                    self._upload.cancel();
                    self._defaultError('file exceeds maximum size of 195GB');
                    return;
                }
            }
            self._processPart(1).then(function (result) {
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
        else if (self.state === upload_1.State.Paused) {
            self._resume();
        }
    };
    // Calculates the MD5 of the part of the file we are uploading
    Azure.prototype._processPart = function (part) {
        var self = this;
        return self._hashData(part.toString(), function () {
            var data, endbyte;
            // Calculate the part of the file that requires hashing
            if (self.size > self._partSize) {
                endbyte = part * self._partSize;
                if (endbyte > self.size) {
                    endbyte = self.size;
                }
                data = self._file.slice((part - 1) * self._partSize, endbyte);
            }
            else {
                data = self._file;
            }
            return data;
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
    Azure.prototype._resume = function (request, firstChunk) {
        if (request === void 0) { request = null; }
        if (firstChunk === void 0) { firstChunk = null; }
        var i, self = this;
        if (request) {
            if (request.type === 'parts') {
                // The upload has already started and we want to continue where we left off
                self._pendingParts = request.part_list;
                for (i = 0; i < self._upload.parallel; i += 1) {
                    self._nextPart();
                }
            }
            else {
                self._api.update({
                    resumable_id: 'n/a',
                    file_id: firstChunk.md5,
                    part: 1
                }).subscribe(function (data) {
                    // We are provided with the first request
                    self._nextPartNumber();
                    self._setPart(data, firstChunk);
                    // Then we want to request any parallel parts
                    for (i = 1; i < self._upload.parallel; i += 1) {
                        self._nextPart();
                    }
                }, function (reason) {
                    // We should start from the beginning
                    self._restart();
                    self._defaultError(reason);
                });
            }
        }
        else {
            // Client side resume after the upload was paused
            for (i = 0; i < self._upload.parallel; i += 1) {
                self._nextPart();
            }
        }
    };
    Azure.prototype._generatePartManifest = function () {
        var list = '<?xml version="1.0" encoding="utf-8"?><BlockList>', i;
        for (i = 0; i < 50000; i += 1) {
            if (i * this._partSize < this.size) {
                list += "<Latest>" + window.btoa(this._pad(i + 1)) + "</Latest>";
            }
            else {
                break;
            }
        }
        list += '</BlockList>';
        return list;
    };
    Azure.prototype._pad = function (number) {
        var str = number.toString();
        while (str.length < 6) {
            str = '0' + str;
        }
        return str;
    };
    Azure.prototype._nextPart = function () {
        var self = this, partNum = self._nextPartNumber();
        if ((partNum - 1) * self._partSize < self.size) {
            self._processPart(partNum).then(function (result) {
                if (self.state !== upload_1.State.Uploading) {
                    // upload was paused or aborted as we were reading the file
                    return;
                }
                ;
                self._api.nextChunk(partNum, result.md5, self._getCurrentParts()).subscribe(function (response) {
                    self._setPart(response, result);
                }, self._defaultError.bind(self));
            }, self._defaultError.bind(self));
        }
        else {
            if (self._currentParts.length === 1 && self._currentParts[0] === partNum) {
                // This is the final commit
                self._isFinishing = true;
                self._api.sign('finish').subscribe(function (request) {
                    request.data = self._generatePartManifest();
                    self._api.signedRequest(request).request
                        .then(self._completeUpload.bind(self), self._defaultError.bind(self));
                }, self._defaultError.bind(self));
            }
            else if (!self._isFinishing) {
                // Remove part just added to _currentParts
                // We need this logic when performing parallel uploads
                self._partComplete(partNum);
                // We should update upload progress
                // NOTE:: no need to subscribe as API does this for us
                // also this is a non-critical request.
                //
                // Also this is only executed towards the end of an upload
                // as no new parts are being requested to update the status
                self._api.update({
                    part_update: true,
                    part_list: self._getCurrentParts()
                });
            }
        }
    };
    Azure.prototype._setPart = function (request, partInfo) {
        var self = this, monitor = self._requestWithProgress(partInfo, request);
        monitor.then(function () {
            self._partComplete(partInfo.part);
            self._nextPart();
        }, self._defaultError.bind(self));
    };
    Azure.prototype._direct = function (request, partInfo) {
        var self = this, monitor = self._requestWithProgress(partInfo, request);
        self._isDirectUpload = true;
        monitor.then(function () {
            self._completeUpload();
        }, self._defaultError.bind(self));
    };
    Azure.lookup = 'MicrosoftAzure';
    return Azure;
}(upload_1.CloudStorage));
exports.Azure = Azure;
//# sourceMappingURL=azure.js.map