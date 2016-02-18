// Angular2 imports
import {Observable} from 'rxjs/Rx';
import {Http} from 'angular2/http';

// Drop service
import {DropService} from 'a2-file-drop/dist/drop-service';
import {DropFiles} from 'a2-file-drop/dist/drop-files';

// Manager imports
import {Upload} from './upload';


export class UploadManager {
    uploads: Array<Upload> = [];

    autoStart: boolean = true;
    autoRemove: boolean = false;
    removeAfter: number = 0;
    simultaneous: number = 2;    // Uploads
    parallel: number = 3;        // Parallel parts of an upload
    retries: number = 4;         // Number of times a failed part can occur for an upload

    metadata: any;               // Additional data to be provided with the upload

    private _stream: Observable<DropFiles>;

    constructor(
        private _http: Http,
        private _apiEndpoint: string,
        dropService: DropService,
        streamName: string,
        map?: (files: DropFiles) => any
    ) {
        var self: UploadManager = this;

        // Remove event and filter for dropped files only
        self._stream = dropService.getStream(streamName).filter((obj) => {
            // Only available on a drop event
            return obj.data && obj.data.length > 0;
        }).flatMap((obj) => {
            return obj.data.promise;
        }).map((obj) => {
            var files = obj.files;
            files.totalBytes = obj.totalSize;

            // Now we have an array of files
            return files;
        });

        // Add optional user defined filter
        if (map) {
            self._stream = self._stream.map(map);
        }

        // Filter if we now have an empty array (user code might have rejected all the files)
        self._stream.filter((files) => {
            return files && files.length > 0;
        });

        // process the incomming files
        self._stream.subscribe(function(files: Array<any>) {
            var autostart = self.autoStart,
                completeCallback = self._uploadComplete.bind(self);

            files.forEach((file) => {
                var upload: Upload = new Upload(self._http, self._apiEndpoint, file, self.retries, self.parallel);
                self.uploads.push(upload);

                // Apply metadata
                upload.metadata = self.metadata;

                // watch for completion
                upload.promise.then(completeCallback, completeCallback);

                // Only autostart if we under our simultaneous limit
                if (autostart) {
                    autostart = self._checkAutostart();
                    if (autostart) {
                        upload.resume();
                    }
                }
            });
        });
    }

    pauseAll() {
        this.uploads.forEach((upload) => {
            upload.pause();
        });
    }

    resumeUpload(upload) {
        upload.resume(this.parallel);
    }

    resumeAll() {
        this.uploads.forEach((upload) => {
            upload.resume(this.parallel);
        });
    }

    updateMetadata(metadata:any) {
        this.metadata = metadata;

        this.uploads.forEach((upload) => {
            upload.metadata = metadata;
        });
    }

    remove(upload: Upload) {
        var index: number = this.uploads.indexOf(upload);
        upload.cancel();

        if (index !== -1) {
            this.uploads.splice(index, 1);
        }
    }

    removeAll() {
        this.uploads.forEach((upload) => {
            upload.cancel();
        });

        this.uploads = [];
    }

    removeComplete() {
        var complete: Array<Upload> = [],
            uploads = this.uploads;

        uploads.forEach((upload) => {
            if (upload.complete) {
                complete.push(upload);
            }
        });

        complete.forEach((upload) => {
            var index: number = uploads.indexOf(upload);
            uploads.splice(index, 1);
        });
    }


    private _checkAutostart() {
        var uploading: number = 0,
            length: number = this.uploads.length,
            index: number = 0;

        for (; index < length; index += 1) {
            if (this.uploads[index].uploading) {
                uploading += 1;

                if (uploading >= this.simultaneous) {
                    return false;
                }
            }
        }

        return true;
    }

    private _uploadComplete(upload) {
        var self = this,
            index:number;

        if (self.autoRemove) {
            if (self.removeAfter) {
                setTimeout(() => {
                    self.remove(upload);
                }, self.removeAfter);
            } else {
                self.remove(upload);
            }
        }

        if (self.autoStart && self._checkAutostart()) {
            for (index = 0; index < length; index += 1) {
                if (self.uploads[index].isWaiting()) {
                    self.uploads[index].resume(self.parallel);
                    break;
                }
            }
        }
    }
}
