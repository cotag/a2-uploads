/// <reference path="../typings/main.d.ts" />

import {CloudStorage, Upload, State} from '../src/upload';
import {CondoApi} from '../src/condo-api';
import {Md5Workers, MD5_WORKER_BASE} from '../src/md5-workers';

import {Http, BaseRequestOptions, Response} from '../node_modules/angular2/http';
import {MockBackend} from '../node_modules/angular2/http/testing';
import {Injector, provide} from '../node_modules/angular2/core';


class MockCS extends CloudStorage {
    startCalled: boolean = false;

    protected _start() {
        this.startCalled = true;
        this.state = State.Uploading;
    }
}


describe('Cloud Storage base class', () => {
    let workers: Md5Workers = new Md5Workers(MD5_WORKER_BASE);
    let injector = Injector.resolveAndCreate([
            MockBackend,
            provide(Http, {
                useFactory: (backend, options) => {
                    return new Http(backend, options);
                },
                deps: [MockBackend]
            })
        ]);
    let backend = injector.get(MockBackend);
    let http = injector.get(Http);

    let cs: MockCS;

    let file: any = {
        name: 'sparta',
        size: 300
    };

    let endpoint: string = 'http://tesing/uploads';
    let upload: Upload = new Upload(http, endpoint, workers, file, 1, 1);
    let api: CondoApi = new CondoApi(http, endpoint, upload);
    let cb;
    let resetStorage = function() {
        cb = null;
        cs = new MockCS(api, upload, workers, () => {
            if (cb) {
                cb();
            }
        });
    };
    let resetCallback = function () {
        cb = null;
    };


    beforeEach(() => {
        resetStorage();
    });


    describe('test upload start', () => {
        it('should only start the upload if it is paused', () => {
            expect(cs.state).toBe(State.Paused);
            expect(cs.startCalled).toBe(false);

            cs.start();
            expect(cs.state).toBe(State.Uploading);
            expect(cs.startCalled).toBe(true);

            cs.startCalled = false;
            expect(cs.startCalled).toBe(false);

            cs.start();
            expect(cs.state).toBe(State.Uploading);
            expect(cs.startCalled).toBe(false);
        });

        it('should complete the upload if that is the only task remaining', () => {
            expect(cs.startCalled).toBe(false);
        });
    });
});
