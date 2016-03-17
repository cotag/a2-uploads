"use strict";
var Rx_1 = require('rxjs/Rx');
var http_1 = require('angular2/http');
var CondoApi = (function () {
    function CondoApi(_http, _apiEndpoint, _upload) {
        this._http = _http;
        this._apiEndpoint = _apiEndpoint;
        this._upload = _upload;
        this._currentRequests = new Set();
        // Clone the upload params
        this._params = Object.assign({}, this._upload.metadata);
    }
    CondoApi.hexToBin = function (input) {
        var result = '', i, length;
        if ((input.length % 2) > 0) {
            input = '0' + input;
        }
        for (i = 0, length = input.length; i < length; i += 2) {
            result += String.fromCharCode(parseInt(input.slice(i, i + 2), 16));
        }
        return result;
    };
    CondoApi.prototype.init = function () {
        var self = this, file = self._upload.file, headers = new http_1.Headers(), search = new http_1.URLSearchParams(), req;
        headers.append('Accept', 'application/json');
        headers.append('Content-Type', 'application/json');
        self._params.file_size = file.size;
        self._params.file_name = file.name;
        if (file.dir_path && file.dir_path.length > 0) {
            self._params.file_path = file.dir_path;
        }
        // Build the search params
        self._setParams(search, self._params);
        // Return the name of the storage provider (google, amazon, rackspace, etc)
        req = self._http.get(self._apiEndpoint + "/new", {
            search: search,
            headers: headers
        }).map(function (res) {
            // Make sure the API service is running
            // console.log(res.text());
            return res.json().residence;
        }).share();
        self._monitorRequest(self, req);
        return req;
    };
    // Create a new upload
    CondoApi.prototype.create = function (options) {
        if (options === void 0) { options = {}; }
        var self = this, headers = new http_1.Headers(), req;
        headers.append('Accept', 'application/json');
        headers.append('Content-Type', 'application/json');
        if (options.file_id) {
            self._params.file_id = options.file_id;
        }
        // We may be requesting the next set of parts
        // TODO:: review this
        if (options.parameters) {
            self._params.parameters = options.parameters;
        }
        req = self._http.post(self._apiEndpoint, JSON.stringify(self._params), {
            headers: headers
        }).map(function (res) {
            var result = res.json();
            // Extract the upload id from the results
            self._uploadId = result.upload_id;
            return result;
        }).share();
        self._monitorRequest(self, req);
        return req;
    };
    // This requests a chunk signature
    //    Only used for resumable / parallel uploads
    CondoApi.prototype.nextChunk = function (partNum, partId, parts, partData) {
        if (partData === void 0) { partData = null; }
        var self = this, search = new http_1.URLSearchParams(), headers = new http_1.Headers(), body = {
            part_list: parts
        }, req;
        if (partData) {
            body.part_data = partData;
        }
        headers.append('Accept', 'application/json');
        headers.append('Content-Type', 'application/json');
        self._setParams(search, {
            part: partNum,
            file_id: partId
        });
        req = self._http.put(self._apiEndpoint + "/" + encodeURIComponent(self._uploadId), JSON.stringify(body), {
            search: search,
            headers: headers
        }).map(function (res) { return res.json(); }).share();
        self._monitorRequest(self, req);
        return req;
    };
    // provides a query request for some providers if required
    CondoApi.prototype.sign = function (part_number, part_id) {
        if (part_id === void 0) { part_id = null; }
        var self = this, search = new http_1.URLSearchParams(), headers = new http_1.Headers(), req;
        headers.append('Accept', 'application/json');
        search.set('part', part_number.toString());
        if (part_id) {
            search.set('file_id', encodeURIComponent(part_id));
        }
        req = self._http.get(self._apiEndpoint + "/" + encodeURIComponent(self._uploadId) + "/edit", {
            search: search
        }).map(function (res) { return res.json(); }).share();
        self._monitorRequest(self, req);
        return req;
    };
    // Either updates the status of an upload (which parts are complete)
    // Or is used to indicate that an upload is complete
    CondoApi.prototype.update = function (params) {
        if (params === void 0) { params = {}; }
        var self = this, headers = new http_1.Headers(), req;
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');
        req = self._http.put(self._apiEndpoint + "/" + encodeURIComponent(self._uploadId), JSON.stringify(params), {
            headers: headers
        }).map(function (res) {
            // NOTE:: This used to check content length however
            // See: https://github.com/angular/angular/pull/7250
            try {
                return res.json();
            }
            catch (e) {
                return null;
            }
        }).share();
        self._monitorRequest(self, req);
        return req;
    };
    // Abort any existing requests
    CondoApi.prototype.abort = function () {
        this._currentRequests.forEach(function (req) {
            req.dispose();
        });
        this._currentRequests.clear();
    };
    // Destroy an upload
    CondoApi.prototype.destroy = function () {
        var self = this;
        self.abort();
        if (self._uploadId) {
            self._http.delete(self._apiEndpoint + "/" + encodeURIComponent(self._uploadId));
        }
    };
    // Executes the signed request against the cloud provider
    // Not very testable however it's the best we can achieve given the tools
    CondoApi.prototype.signedRequest = function (opts, monitor) {
        if (monitor === void 0) { monitor = false; }
        var self = this, response = {}, promise, dispose;
        promise = new Promise(function (resolve, reject) {
            var i, xhr = new XMLHttpRequest(), observable;
            if (monitor) {
                response.progress = new Rx_1.Observable(function (obs) {
                    observable = obs;
                });
            }
            // For whatever reason, this event has to bound before
            // the upload starts or it does not fire (at least on Chrome)
            xhr.upload.addEventListener('progress', function (evt) {
                if (evt.lengthComputable && observable) {
                    observable.next({
                        loaded: evt.loaded,
                        total: evt.total
                    });
                }
            });
            xhr.addEventListener('load', function (evt) {
                self._currentRequests.delete(promise);
                // We are looking for a success response unless there is an expected response
                if ((xhr.status >= 200 && xhr.status < 300) ||
                    (xhr.status === opts.expected)) {
                    resolve(xhr);
                }
                else {
                    reject(xhr.status + ": " + xhr.statusText);
                }
            });
            xhr.addEventListener('error', function (evt) {
                self._currentRequests.delete(promise);
                reject(xhr.status + ": " + (xhr.statusText || 'unknown error'));
            });
            xhr.addEventListener('abort', function (evt) {
                self._currentRequests.delete(promise);
                reject(xhr.statusText || 'browser aborted');
            });
            xhr.open(opts.signature.verb, opts.signature.url, true // async
            );
            // Set the headers
            for (i in opts.signature.headers) {
                xhr.setRequestHeader(i, opts.signature.headers[i]);
            }
            // Allow the request to be cancelled (quack!)
            dispose = function () {
                xhr.abort();
                self._currentRequests.delete(promise);
                reject('user aborted');
            };
            xhr.send(opts.data || null);
        });
        // Hook up the request monitoring
        promise.dispose = dispose;
        self._currentRequests.add(promise);
        response.request = promise;
        return response;
    };
    CondoApi.prototype._monitorRequest = function (self, req) {
        self._currentRequests.add(req);
        req.subscribe(null, null, function () {
            self._currentRequests.delete(req);
        });
    };
    CondoApi.prototype._setParams = function (search, params) {
        var key;
        for (key in params) {
            search.set(key, encodeURIComponent(params[key]));
        }
    };
    return CondoApi;
}());
exports.CondoApi = CondoApi;
//# sourceMappingURL=condo-api.js.map