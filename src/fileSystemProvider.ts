/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/


import * as path from 'path';

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { HC3 } from './hc3';

class FS implements vscode.FileStat {
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	constructor(type: vscode.FileType, ctime: number, mtime: number, size: number) {
		this.type = type;
		this.ctime = ctime;
		this.mtime = mtime;
		this.size = size;
	}
}

export class HC3FS implements vscode.FileSystemProvider {
	fdir: string;
	hc3?: HC3;
	private _emitter: vscode.EventEmitter<vscode.FileChangeEvent[]>;
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

	constructor() {
		this.fdir = '';
		this._emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
		this.onDidChangeFile = this._emitter.event;
	}

	setHC3(hc3: HC3) {
		this.hc3 = hc3;
		this.hc3._emitter = this._emitter;
	}

	private async isInited() {
		await this.hc3!.gate.waitForGate();
		this.fdir = this.hc3!.fdir!;
	}
	
	watch(_resource: vscode.Uri): vscode.Disposable {
		// ignore, fires for all changes...
		return new vscode.Disposable(() => { });
	}

	// --- manage file metadata
	
	async checkPath(uri: vscode.Uri, read = false) {
		if (uri.path.startsWith("/.")) {
			throw vscode.FileSystemError.FileNotFound();
		}
		await this.isInited();
		await this.hc3!.resolvePath(uri.path,read);
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		await this.checkPath(uri);
		const nuri = path.join(this.fdir,uri.path);
		const res = await fs.stat(nuri);
		const fstat = new FS(res.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File, res.ctimeMs, res.mtimeMs, res.size);
		this.hc3!.debug('stat: ' + uri.path);
		return fstat;
	}
	
	async readDirectory(uri: vscode.Uri): Promise<Array<[string, vscode.FileType]>> {
		await this.checkPath(uri);
		this.hc3!.debug('readDirectory: ' + uri.path);
		const nuri = path.join(this.fdir,uri.path);
		const files = await fs.readdir(nuri);
		const result: Array<[string, vscode.FileType]> = [];
		for (let i = 0; i < files.length; i++) {
			const fpath = path.join(uri.path,files[i]);
			const res = await fs.stat(path.join(nuri,files[i]));
			const ftype = res.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File;
			result.push([fpath, ftype]);
		}
		return result;
	}

	// --- manage file contents
	
	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		await this.checkPath(uri,true);
		this.hc3!.debug('readFile: ' + uri.path);
		const nuri = path.join(this.fdir,uri.path);
		const data = await fs.readFile(nuri);
		const str = data.toString();
		return data;
	}
	
	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
		await this.checkPath(uri);
		this.hc3!.debug('writeFile: ' + uri.path);
		const nuri = path.join(this.fdir,uri.path);
		return await fs.writeFile(nuri,content);
	}
	
	// --- manage files/folders
	
	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		await this.checkPath(oldUri);
		this.hc3!.debug(`renameFile: ${oldUri.path}->${newUri.path}`);
		const ouri = path.join(this.fdir,oldUri.path);
		const nuri = path.join(this.fdir,newUri.path);
		return await fs.rename(ouri,nuri);
	}
	
	async delete(uri: vscode.Uri): Promise<void> {
		await this.checkPath(uri);
		this.hc3!.debug(`deleteFile: ${uri.path}`);
		const nuri = uri.with({path: path.join(this.fdir,uri.path)});
		return await fs.rm(nuri.path);
	}
	
	// copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
	// 	this.debug('copy: ' + source.path,LOGCOLOR);
	// 	throw vscode.FileSystemError.NoPermissions;
	// }
	
	async createDirectory(uri: vscode.Uri): Promise<void> {
		throw vscode.FileSystemError.NoPermissions;
	}
	
}


