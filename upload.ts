
import {Http} from 'angular2/http';

import {CondoApi} from './condo-api';


// All providers share these states
export enum State {
    Paused,
    Uploading,
    Completed,
    Aborted
}

// Must be the same as CloudStorage
export interface ICloudStorage {
    new (_api: CondoApi, _upload: Upload, _completeCB: any): CloudStorage;
    lookup: string;
}


// ============================
// Storage Provider Abstraction
// ============================
export abstract class CloudStorage {
    static name: string;

    state: State = State.Paused;
    size: number;
    progress: number = 0;

    // Strategy is used to indicate progress
    // * undefined == not started
    // * null      == we have made a call to create
    // * string    == upload in progress
    protected _strategy: string;
    protected _file: any;
    protected _finalising: boolean = false;
    protected _pendingParts: Array<number> = [];
    protected _currentParts: Array<number> = [];

    // Store hashing results in case the user pauses and resumes
    protected _memoization: any = {};
    private   _lastPart: number = 0;


    constructor(protected _api: CondoApi, protected _upload: Upload, private _completeCB: any) {
        this._file = this._upload.file;
        this.size = this._file.size;
    }


    start() {
        if (this.state < State.Uploading) {
            if (this._finalising) {
                this._completeUpload();
            } else {
                this._start();
            }
        }
    }

    pause(reason = null) {
        if (this._strategy && this.state === State.Uploading) {
            this.state = State.Paused;
            this._api.abort();
            this._pendingParts = this._getCurrentParts();
            this._currentParts = [];
        } else if (!this._strategy) {
            // We don't have a strategy yet
            this.state = State.Paused;
            this._api.abort();
            this._restart();
        }

        // TODO:: propagate the reason for the pause to the user
        // only if there is an error
    }

    destroy() {
        // Check the upload has not finished
        if (this._strategy !== undefined && this.state < State.Completed) {
            this._api.destroy();

            // nullifies strategy
            this._restart();
            this.state = State.Aborted;
        }
    }


    protected abstract _start(): any;


    protected _nextPartNumber() {
        if (this._pendingParts.length > 0) {
            this._lastPart = this._pendingParts.shift();
        } else {
            this._lastPart += 1;
        }

        this._currentParts.push(this._lastPart);

        return this._lastPart;
    }

    protected _getCurrentParts() {
        return this._currentParts.concat(this._pendingParts);
    }

    protected _partComplete(number:number) {
        this._currentParts = this._currentParts.filter((val) => {
            return val !== number;
        });
    }

    // NOTE:: Should probably be protected.
    // Only called by an upload strategy
    protected _completeUpload() {
        var self = this;

        self._finalising = true;
        self.state = State.Uploading;

        self._api.update().subscribe(() => {
            self.progress = self.size;
            self._finalising = false;
            self.state = State.Completed;

            // Complete the upload
            self._upload.complete = true;
            self._upload.uploading = false;
            self._upload.cancelled = false;
            self._completeCB(self._upload);
        }, self._defaultError.bind(self));
    }

    protected _defaultError(reason) {
        // TODO:: we may need to update more state
        this.pause(reason);
    }

    protected _requestWithProgress(partInfo, request) {
        var self = this,
            monitor;

        request.data = partInfo.data;

        monitor = self._api.signedRequest(request, true);
        monitor.progress.subscribe((vals) => {
            // TODO:: progress is incorrect here
            // we need this to be tracked properly
            self.progress = vals.loaded;
            self.size = vals.total;
        });

        return monitor.request;
    }


    protected _restart() {
        this._strategy = undefined;
    }

    protected _hashData(id: string, dataCb, hashCb) {
        var self = this,
            result = self._memoization[id],

            // We don't want to hold references to the data
            data = dataCb();

        if (result) {
            // return the pre-calculated result if available
            return new Promise((resolve) => {
                resolve({
                    data: data,
                    md5: result.md5,
                    part: result.part
                });
            });
        } else {
            // Perform the processing in full and save the result
            return hashCb(data).then((result) => {
                self._memoization[id] = result;
                return {
                    data: data,
                    md5: result.md5,
                    part: result.part
                };
            });
        }
    }
}


// ============================================================
// This is used to manage an upload to a Cloud Storage Provider
// ============================================================
export class Upload {
    static provider: any = {};

    complete: boolean = false;
    uploading: boolean = false;
    cancelled: boolean = false;
    metadata: any;    // Data provided at the start and completion of an upload

    // Provide feedback as to why an upload failed
    error: string;

    // Resolved when the upload completes or is cancelled
    promise: Promise<Upload>;

    private _initialised: boolean = false;
    private _resolve: any;
    private _reject: any;

    private _api: CondoApi;
    private _provider: CloudStorage;
    private _retries: number = 0;


    constructor(
        private _http: Http,
        private _apiEndpoint: string,
        public file: any,
        public retries: number,
        public parallel: number
    ) {
        var self = this;
        self.promise = new Promise((resolve, reject) => {
            self._resolve = resolve;
            self._reject = reject;
        });
    }

    resume(parallel?:number) {
        var self = this;

        if (!self.uploading && !self.complete && !self.cancelled) {
            self.uploading = true;

            if (parallel) {
                self.parallel = parallel;
            }

            if (!self._initialised) {
                // We need to call new to get details on the upload target
                self._api = new CondoApi(self._http, self._apiEndpoint, self);
                self._api.init().subscribe(
                    (residence) => {
                        self._initialise(residence);
                        self._provider.start();
                    },
                    err => self._retry(err)
                );
            } else {
                self._provider.start();
            }
        }
    }

    pause() {
        if (this.uploading) {
            this._provider.pause();
            this.uploading = false;
        }
    }

    cancel() {
        var self = this;

        if (!self.complete && !self.cancelled) {
            self.pause();

            if (self._initialised) {
                // TODO:: destroy the upload here

                self._initialised = false;
            }

            self.cancelled = true;
            self.uploading = false;
            self._reject(self);
        }
    }

    isWaiting() {
        if (!this._initialised && !this.complete && !this.uploading && !this.cancelled) {
            return true;
        }
        return false;
    }

    humanReadableByteCount(si:boolean = false) {
        var unit = si ? 1000.0 : 1024.0,
            bytes = this.file.size;

        if (bytes < unit) { return bytes + (si ? ' iB' : ' B'); }

        var exp = Math.floor(Math.log(bytes) / Math.log(unit)),
            pre = (si ? 'kMGTPE' : 'KMGTPE').charAt(exp - 1) + (si ? 'iB' : 'B');

        return (bytes / Math.pow(unit, exp)).toFixed(1) + ' ' + pre;
    }


    private _initialise(residence: string) {
        var Provider = Upload.provider[residence];

        if (Provider) {
            this._provider = new Provider(this._api, this, this._resolve);
            this._initialised = true;
        } else {
            // inform the user that this is not implemented
            // TODO:: we should probably have an interface for the UI to bind to
            console.error(`provider, ${residence}, not found`);
        }
    }


    private _retry(err) {
        var self = this;

        console.error(err);

        if (self._retries < self.retries) {
            self._retries += 1;

            if (self._initialised) {
                self._provider.start();
            } else {
                self.uploading = false;
                self.resume();
            }
        } else {
            self.pause();
        }
    }
}
