"use strict";
var condo_api_1 = require('./condo-api');
// All providers share these states
(function (State) {
    State[State["Paused"] = 0] = "Paused";
    State[State["Uploading"] = 1] = "Uploading";
    State[State["Completed"] = 2] = "Completed";
    State[State["Aborted"] = 3] = "Aborted";
})(exports.State || (exports.State = {}));
var State = exports.State;
// ============================
// Storage Provider Abstraction
// ============================
var CloudStorage = (function () {
    function CloudStorage(_api, _upload, _md5Workers, _completeCB) {
        this._api = _api;
        this._upload = _upload;
        this._md5Workers = _md5Workers;
        this._completeCB = _completeCB;
        this.state = State.Paused;
        this.progress = 0;
        this._finalising = false;
        this._pendingParts = [];
        this._currentParts = [];
        // Store hashing results in case the user pauses and resumes
        this._memoization = {};
        this._isDirectUpload = false;
        this._isFinishing = false;
        this._lastPart = 0;
        this._progress = {};
        this._file = this._upload.file;
        this.size = this._file.size;
    }
    CloudStorage.prototype.start = function () {
        if (this.state < State.Uploading) {
            if (this._finalising) {
                this._completeUpload();
            }
            else {
                this._start();
            }
        }
    };
    CloudStorage.prototype.pause = function () {
        if (this._strategy && this.state === State.Uploading && !this._isDirectUpload) {
            this.state = State.Paused;
            this._api.abort();
            this._pendingParts = this._getCurrentParts();
            this._currentParts = [];
        }
        else if (!this._strategy || this._isDirectUpload) {
            // We don't have a strategy yet
            this.state = State.Paused;
            this._api.abort();
            this._restart();
        }
        var key;
        for (key in this._progress) {
            if (this._progress[key].loaded !== this._progress[key].total) {
                this._progress[key].loaded = 0;
            }
        }
        ;
        this._updateProgress();
    };
    CloudStorage.prototype.destroy = function () {
        // Check the upload has not finished
        if (this._strategy !== undefined && this.state < State.Completed) {
            this._api.destroy();
            // nullifies strategy
            this._restart();
            this.state = State.Aborted;
        }
    };
    CloudStorage.prototype._nextPartNumber = function () {
        if (this._pendingParts.length > 0) {
            this._lastPart = this._pendingParts.shift();
        }
        else {
            this._lastPart += 1;
        }
        this._currentParts.push(this._lastPart);
        return this._lastPart;
    };
    CloudStorage.prototype._getCurrentParts = function () {
        return this._currentParts.concat(this._pendingParts);
    };
    CloudStorage.prototype._partComplete = function (number) {
        this._currentParts = this._currentParts.filter(function (val) {
            return val !== number;
        });
    };
    // NOTE:: Should probably be protected.
    // Only called by an upload strategy
    CloudStorage.prototype._completeUpload = function () {
        var self = this;
        self._finalising = true;
        self.state = State.Uploading;
        self._api.update().subscribe(function () {
            self.progress = self.size;
            self._finalising = false;
            self.state = State.Completed;
            // Complete the upload
            self._upload.complete = true;
            self._upload.uploading = false;
            self._upload.cancelled = false;
            self._completeCB(self._upload);
        }, self._defaultError.bind(self));
    };
    CloudStorage.prototype._defaultError = function (reason) {
        this.pause();
        this._upload.notifyError(reason);
    };
    CloudStorage.prototype._requestWithProgress = function (partInfo, request) {
        var self = this, monitor;
        request.data = partInfo.data;
        monitor = self._api.signedRequest(request, true);
        monitor.progress.subscribe(function (vals) {
            self._progress[partInfo.part] = vals;
            self._updateProgress();
        });
        return monitor.request;
    };
    CloudStorage.prototype._updateProgress = function () {
        var key, total = 0;
        for (key in this._progress) {
            total += this._progress[key].loaded;
        }
        ;
        this._upload.progress = total;
    };
    CloudStorage.prototype._restart = function () {
        this._strategy = undefined;
        this._currentParts = [];
        this._pendingParts = [];
    };
    CloudStorage.prototype._hashData = function (id, dataCb, hashCb) {
        var self = this, result = self._memoization[id], 
        // We don't want to hold references to the data
        data = dataCb();
        if (result) {
            // return the pre-calculated result if available
            return new Promise(function (resolve) {
                resolve({
                    data: data,
                    md5: result.md5,
                    part: result.part
                });
            });
        }
        else {
            // Perform the processing in full and save the result
            return hashCb(data).then(function (result) {
                self._memoization[id] = result;
                return {
                    data: data,
                    md5: result.md5,
                    part: result.part
                };
            });
        }
    };
    // This provides the minimum information required to be
    // stored for resuming a parallel upload
    CloudStorage.prototype._getPartData = function () {
        var _this = this;
        var partList = this._getCurrentParts(), partData = [];
        partList.forEach(function (partNum) {
            var details = _this._memoization[partNum.toString()];
            if (details) {
                partData.push(details);
            }
        });
        return {
            part_list: partList,
            part_data: partData
        };
    };
    return CloudStorage;
}());
exports.CloudStorage = CloudStorage;
// ============================================================
// This is used to manage an upload to a Cloud Storage Provider
// ============================================================
var Upload = (function () {
    function Upload(_http, _apiEndpoint, _md5Workers, file, retries, parallel) {
        this._http = _http;
        this._apiEndpoint = _apiEndpoint;
        this._md5Workers = _md5Workers;
        this.file = file;
        this.retries = retries;
        this.parallel = parallel;
        this.complete = false;
        this.uploading = false;
        this.cancelled = false;
        this.progress = 0;
        this.filename = '';
        this._initialised = false;
        this._retries = 0;
        var self = this;
        self.promise = new Promise(function (resolve, reject) {
            self._resolve = resolve;
            self._reject = reject;
        });
        self.totalBytes = self.file.size;
        if (self.file.name) {
            self.filename = self.file.name;
        }
    }
    Upload.humanReadableByteCount = function (bytes, si) {
        if (si === void 0) { si = false; }
        var unit = si ? 1000.0 : 1024.0;
        if (bytes < unit) {
            return bytes + (si ? ' iB' : ' B');
        }
        var exp = Math.floor(Math.log(bytes) / Math.log(unit)), pre = (si ? 'kMGTPE' : 'KMGTPE').charAt(exp - 1) + (si ? 'iB' : 'B');
        return (bytes / Math.pow(unit, exp)).toFixed(1) + ' ' + pre;
    };
    Upload.prototype.resume = function (parallel) {
        var self = this;
        if (!self.uploading && !self.complete && !self.cancelled) {
            self.uploading = true;
            if (parallel) {
                self.parallel = parallel;
            }
            if (!self._initialised) {
                // We need to call new to get details on the upload target
                self._api = new condo_api_1.CondoApi(self._http, self._apiEndpoint, self);
                self._api.init().subscribe(function (residence) {
                    self._initialise(residence);
                    if (self._initialised) {
                        self._provider.start();
                    }
                }, function (err) { return self.notifyError(err); });
            }
            else {
                self._provider.start();
            }
        }
    };
    Upload.prototype.pause = function () {
        if (this.uploading) {
            this._provider.pause();
            this.uploading = false;
        }
    };
    Upload.prototype.cancel = function () {
        var self = this;
        if (!self.complete && !self.cancelled) {
            self.pause();
            // Destroy the upload if it has started
            if (self._initialised) {
                self._provider.destroy();
                self._initialised = false;
            }
            self.cancelled = true;
            self.uploading = false;
            self._reject(self);
        }
    };
    Upload.prototype.isWaiting = function () {
        if (!this._initialised && !this.complete && !this.uploading && !this.cancelled) {
            return true;
        }
        return false;
    };
    Upload.prototype.notifyError = function (err) {
        var self = this;
        console.error(err);
        if (self._retries < self.retries) {
            self._retries += 1;
            if (self._initialised) {
                self._provider.start();
            }
            else {
                self.uploading = false;
                self.resume();
            }
        }
        else {
            self.pause();
            self.error = err;
        }
    };
    Upload.prototype._initialise = function (residence) {
        var Provider = Upload.provider[residence];
        if (Provider) {
            this._provider = new Provider(this._api, this, this._md5Workers, this._resolve);
            this._initialised = true;
        }
        else {
            // inform the user that this is not implemented
            this.error = "provider, " + residence + ", not found";
            console.error(this.error);
            // The upload cannot be performed
            this.uploading = false;
            this.cancel();
        }
    };
    Upload.provider = {};
    return Upload;
}());
exports.Upload = Upload;
//# sourceMappingURL=upload.js.map