
import {Observable} from 'rxjs/Rx';
import {Http, Headers, URLSearchParams} from 'angular2/http';
import {ParallelHasher} from 'ts-md5/dist/parallel_hasher';

import {Upload} from './upload';


export class CondoApi {
    // TODO:: we need to have a configurable variable indicate the
    // location of the worker files.
    private static _next: number = -1;
    private static _workers = [
        new ParallelHasher('/node_modules/ts-md5/dist/md5_worker.js'),
        new ParallelHasher('/node_modules/ts-md5/dist/md5_worker.js'),
        new ParallelHasher('/node_modules/ts-md5/dist/md5_worker.js')
    ];

    public uploadId: string;

    private _params: any;
    private _uploadId: string;
    private _currentRequests = new Set<any>();


    static nextHasher() {
        this._next += 1;
        if (this._next >= this._workers.length) {
            this._next = 0;
        }

        return this._workers[this._next];
    }

    static hexToBin(input: string) {
        var result = '',
            i, length;

        if ((input.length % 2) > 0) {
            input = '0' + input;
        }

        for (i = 0, length = input.length; i < length; i += 2) {
            result += String.fromCharCode(parseInt(input.slice(i, i + 2), 16));
        }

        return result;
    }


    constructor(private _http: Http, private _apiEndpoint: string, private _upload: Upload) {
        // Clone the upload params
        this._params = Object.assign({}, this._upload.metadata);
    }


    init() {
        var self = this,
            file = self._upload.file,
            headers = new Headers(),
            req;

        headers.append('Content-Type', 'application/json');

        self._params.file_size = file.size;
        self._params.file_name = file.name;

        if (file.dir_path) {
            self._params.file_path = file.dir_path;
        }

        // Return the name of the storage provider (google, amazon, rackspace, etc)
        req = self._http.get('#{ self._apiEndpoint }/new', {
            body: JSON.stringify(self._params),
            headers: headers
        }).map((res) => {
            // Make sure the API service is running
            // console.log(res.text());
            return res.json().residence;
        }).share();

        self._monitorRequest(self, req);

        return req;
    }


    // Create a new upload
    create(options:any = {}) {
        var self = this,
            headers = new Headers(),
            req;

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
        }).map(function(res) {
            var result = res.json();

            // Extract the upload id from the results
            self._uploadId = result.upload_id;

            return result;
        }).share();

        self._monitorRequest(self, req);

        return req;
    }


    // This requests a chunk signature
    //    Only used for resumable / parallel uploads
    nextChunk(partNum: number, partId: string, parts: Array<number>, partData: any = null) {
        var self = this,
            search = new URLSearchParams(),
            body: any = {
                part_list: parts
            },
            req;

        if (partData) {
            body.part_data = partData;
        }

        search.set('part', partNum.toString());
        search.set('file_id', partId);

        req = self._http.post('#{ self._apiEndpoint }/#{ encodeURIComponent(self._uploadId) }/next_part',
            JSON.stringify(body),
            {
                search: search
            }
        ).map(res => res.json()).share();

        self._monitorRequest(self, req);

        return req;
    }


    // provides a query request for some providers if required
    sign(part_number:any, part_id:string = null) {
        var self = this,
            search = new URLSearchParams(),
            req;

        search.set('part', part_number.toString());
        if (part_id) {
            search.set('file_id', part_id);
        }

        req = self._http.get('#{ self._apiEndpoint }/#{ encodeURIComponent(self._uploadId) }/edit', {
            search: search
        }).map(res => res.json()).share();

        self._monitorRequest(self, req);

        return req;
    }


    // Either updates the status of an upload (which parts are complete)
    // Or is used to indicate that an upload is complete
    update(params:any = {}) {
        var self = this,
            headers = new Headers(),
            req;

        headers.append('Content-Type', 'application/json');

        req = self._http.put('#{ self._apiEndpoint }/#{ encodeURIComponent(self._uploadId) }', JSON.stringify(params), {
            headers: headers
        }).map(res => res.json()).share();

        self._monitorRequest(self, req);

        return req;
    }


    // Abort any existing requests
    abort() {
        this._currentRequests.forEach((req) => {
            req.dispose();
        });

        this._currentRequests.clear();
    }


    // Destroy an upload
    destroy() {
        var self = this;

        self.abort();
        if (self._uploadId) {
            return self._http.delete('#{ self._apiEndpoint }/#{ encodeURIComponent(self._uploadId) }');
        }
    }


    // Executes the signed request against the cloud provider
    // Not very testable however it's the best we can achieve given the tools
    signedRequest(opts:any) {
        var self = this,
            promise: any,
            observer: any,
            progress = new Observable<{loaded:number, total:number}>((obs) => {
                observer = obs;
            });

        promise = new Promise((resolve, reject) => {
            var i: string,
                xhr = new XMLHttpRequest();

            xhr.addEventListener('progress', (evt: any) => {
                observer.next({
                    loaded: evt.loaded,
                    total: evt.total
                });
            });
            xhr.addEventListener('load', (evt: any) => {
                self._currentRequests.delete(promise);
                resolve(evt.response);
            });
            xhr.addEventListener('error', evt => {
                self._currentRequests.delete(promise);
                reject(xhr.statusText || 'unknown error');
            });
            xhr.addEventListener('abort', evt => {
                self._currentRequests.delete(promise);
                reject(xhr.statusText || 'browser aborted');
            });

            xhr.open(
                opts.signature.verb,
                opts.signature.url,
                true // async
            );

            // Set the headers
            for (i in opts.signature.headers) {
                xhr.setRequestHeader(i, opts.signature.headers[i]);
            }

            xhr.send(opts.signature.data || null);

            // Hook up the request monitoring
            self._currentRequests.add(promise);

            // Allow the request to be cancelled (quack!)
            promise.dispose = function () {
                xhr.abort();
                self._currentRequests.delete(promise);
                reject('user aborted');
            };
        });

        return {
            request: promise,
            progress: progress
        };
    }


    private _monitorRequest(self, req) {
        self._currentRequests.add(req);
        req.subscribe(null, null, () => {
            self._currentRequests.delete(req);
        });
    }
}
