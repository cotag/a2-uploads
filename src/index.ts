/*
 * @Author: Alex Sorafumo
 * @Date: 2017-06-08 09:30:17
 * @Last Modified by: Alex Sorafumo
 * @Last Modified time: 2017-06-08 10:05:46
 */

import { NgModule } from '@angular/core';
import { HttpModule } from '@angular/http';

import { Md5Workers } from './md5-workers';
import { LIB_UTILS } from './settings';
import { UploadManager } from './upload-manager';

export * from './amazon';
export * from './azure';
export * from './google';
export * from './md5-workers';
export * from './openstack';
export * from './upload';
export * from './upload-manager';


@NgModule({
    declarations: [],
    imports: [
            // Angular Modules
        HttpModule,
    ],
    entryComponents: [],
    providers: [
        UploadManager,
        Md5Workers,
    ],
})
export class UploadsModule {
    private static init: boolean = false;

    private version: string = '1.0.1';
    private build: string = '2017-06-08.v1';

    constructor() {
        if (!UploadsModule.init) {
            UploadsModule.init = true;
            LIB_UTILS.version(this.version, this.build);
        }
    }
}

export const ACA_UPLOADS_MODULE = UploadsModule;
