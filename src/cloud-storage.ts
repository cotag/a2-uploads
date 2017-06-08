
import { CondoApi } from './condo-api';
import { Md5Workers } from './md5-workers';
import { Upload } from './upload';

// All providers share these states
export enum State {
    Paused,
    Uploading,
    Completed,
    Aborted,
}

// Must be the same as CloudStorage
export interface ICloudStorage {
    lookup: string;
    new (_api: CondoApi, _upload: Upload, _md5Workers: Md5Workers, _completeCB: any): CloudStorage;
}

// /*
// ============================
// Storage Provider Abstraction
// ============================
export abstract class CloudStorage {
    // public static name: string;

    public state: State = State.Paused;
    public size: number;
    public progress: number = 0;

    // Strategy is used to indicate progress
    // * undefined == not started
    // * null      == we have made a call to create
    // * string    == upload in progress
    protected _strategy: string;
    protected _file: any;
    protected _finalising: boolean = false;
    protected _pendingParts: number[] = [];
    protected _currentParts: number[] = [];

    // Store hashing results in case the user pauses and resumes
    protected _memoization: any = {};
    protected _isDirectUpload: boolean = false;
    protected _isFinishing: boolean = false;

    private _lastPart: number = 0;
    private _progress: any = {};


    constructor(protected _api: CondoApi,
                protected _upload: Upload,
                protected _md5Workers: Md5Workers,
                private _completeCB: any) {
        this._file = this._upload.file;
        this.size = this._file.size;
    }

    public start() {
        if (this.state < State.Uploading) {
            if (this._finalising) {
                this._completeUpload();
            } else {
                this._start();
            }
        }
    }

    public pause() {
        if (this._strategy && this.state === State.Uploading && !this._isDirectUpload) {
            this.state = State.Paused;
            this._api.abort();
            this._pendingParts = this._getCurrentParts();
            this._currentParts = [];
        } else if (!this._strategy || this._isDirectUpload) {
            // We don't have a strategy yet
            this.state = State.Paused;
            this._api.abort();
            this._restart();
        }

        let key;
        for (key in this._progress) {
            if (this._progress[key].loaded !== this._progress[key].total) {
                this._progress[key].loaded = 0;
            }
        }
        this._updateProgress();
    }

    public destroy() {
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

    protected _partComplete(num: number) {
        this._currentParts = this._currentParts.filter((val) => {
            return val !== num;
        });
    }

    // NOTE:: Should probably be protected.
    // Only called by an upload strategy
    protected _completeUpload() {

        this._finalising = true;
        this.state = State.Uploading;

        this._api.update().subscribe(() => {
            this.progress = this.size;
            this._finalising = false;
            this.state = State.Completed;

            // Complete the upload
            this._upload.complete = true;
            this._upload.uploading = false;
            this._upload.cancelled = false;
            this._completeCB(this._upload);
        }, this._defaultError.bind(this));
    }

    protected _defaultError(reason) {
        this.pause();
        this._upload.notifyError(reason);
    }

    protected _requestWithProgress(partInfo, request) {
        let monitor: any;

        request.data = partInfo.data;

        monitor = this._api.signedRequest(request, true);
        monitor.progress.subscribe((vals) => {
            this._progress[partInfo.part] = vals;
            this._updateProgress();
        });

        return monitor.request;
    }

    protected _updateProgress() {
        let total: number = 0;

        for (const key in this._progress) {
            if (this._progress.hasOwnProperty(key)) {
                total += this._progress[key].loaded;
            }
        }

        this._upload.progress = total;
    }

    protected _restart() {
        this._strategy = undefined;
        this._currentParts = [];
        this._pendingParts = [];
    }

    protected _hashData(id: string, dataCb, hashCb) {
        const result = this._memoization[id];

            // We don't want to hold references to the data
        const data = dataCb();

        if (result) {
            // return the pre-calculated result if available
            return new Promise((resolve) => {
                resolve({
                    data,
                    md5: result.md5,
                    part: result.part,
                });
            });
        } else {
            // Perform the processing in full and save the result
            return hashCb(data).then((hash) => {
                this._memoization[id] = hash;
                return {
                    data,
                    md5: hash.md5,
                    part: hash.part,
                };
            });
        }
    }

    // This provides the minimum information required to be
    // stored for resuming a parallel upload
    protected _getPartData() {
        const partList = this._getCurrentParts();
        const partData = [];

        partList.forEach((partNum) => {
            const details = this._memoization[partNum.toString()];

            if (details) {
                partData.push(details);
            }
        });

        return {
            part_list: partList,
            part_data: partData,
        };
    }
}
