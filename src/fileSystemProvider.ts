/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/


import * as path from 'path';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { HC3, isNode, Node, isLeaf, Leaf } from './hc3';

export class HC3FS implements vscode.FileSystemProvider {
	vdir: string;
	hc3?: HC3;
	private _emitter: vscode.EventEmitter<vscode.FileChangeEvent[]>;
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

	constructor() {
		this.vdir = '';
		this._emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
		this.onDidChangeFile = this._emitter.event;
	}

	setHC3(hc3: HC3) {
		this.hc3 = hc3;
		this.hc3._emitter = this._emitter;
	}

	private isInited() {
		if (!this.hc3) { throw vscode.FileSystemError.NoPermissions("HC3 not mounted");}
	}
	
	watch(_resource: vscode.Uri): vscode.Disposable {
		// ignore, fires for all changes...
		return new vscode.Disposable(() => { });
	}

	private splitPath(uri: vscode.Uri): [string,string] {
		const basename = path.posix.basename(uri.path);
		const dir = path.posix.dirname(uri.path);
		return [dir,basename];
	}

	// --- manage file metadata
	
	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		this.isInited();
		const entry = await this.hc3!.lookup(uri.path, false);
		if (!entry) {
			this.hc3!.debug('stat: ' + uri.path + ' not found');
			throw vscode.FileSystemError.FileNotFound();
		}
		this.hc3!.debug('stat: ' + uri.path + ' found');
		return entry as vscode.FileStat;
	}
	
	async readDirectory(uri: vscode.Uri): Promise<Array<[string, vscode.FileType]>> {
		this.isInited();
		this.hc3!.debug('readDirectory: ' + uri.path);
		const inited = await this.hc3!.waitForInit();
		const entry = await this.hc3!.lookup(uri.path, false);
		if (isNode(entry)) {
			const result: [string, vscode.FileType][] = [];
			for (const [name, child] of entry.entries) {
				result.push([name, child.type]);
			}
			return result;
		}
		throw vscode.FileSystemError.FileNotADirectory();
	}

	// --- manage file contents
	
	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		this.isInited();
		if (uri.path.startsWith('/.vscode')) {
			// const filePath = this.vdir + uri.path;
			// try {
			//   // this.hc3.debug('read fs file: ' + uri.path);
			// 	const fileContent = fs.readFileSync(filePath);
			// 	return Uint8Array.from(fileContent);
			// } catch (e) {
			// 	throw vscode.FileSystemError.FileNotFound();
			// }
			throw vscode.FileSystemError.FileNotFound();
		}
		this.hc3!.debug('readFile: ' + uri.path);
		const inited = await this.hc3!.waitForInit();
		const entry = await this.hc3!.lookup(uri.path, false);
		if (isLeaf(entry)) {
			const data = await entry.getContent();
			this.hc3!.debug(`readFile: ${uri.path} (${data.byteLength} bytes)`);
			return data;
		}
		throw vscode.FileSystemError.FileNotFound();
	}
	
	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
		this.isInited();
		let [dir, name] = this.splitPath(uri);
		const entry = await this.hc3!.lookup(dir, false);
		if (isNode(entry)) {
			if (entry.permissions === vscode.FilePermission.Readonly) {
				throw vscode.FileSystemError.NoPermissions();
			}
			if (entry.entries.has(name) && !options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
			if (!entry.entries.has(name) && !options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}
			if (entry.entries.has(name)) {
				this.hc3!.debug(`writeFile: ${uri.path} (${content.byteLength} bytes)`);
				const leaf = entry.entries.get(name) as Leaf;
				return leaf.writeContent(content);
			} else {
				this.hc3!.debug('createFile: ' + uri.path);
				const node = entry as Node;
				const leaf = node.createLeaf(name);
				return leaf.writeContent(content);
			}
		}
		throw vscode.FileSystemError.FileNotFound();
	}
	
	// --- manage files/folders
	
	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		this.isInited();
		const entry = await this.hc3!.lookup(oldUri.path, false);
		let [oldDir, oldName] = this.splitPath(oldUri);
		let [newDir, newName] = this.splitPath(newUri);
		if (oldDir !== newDir) {
			vscode.window.showErrorMessage('hc3fs: cannot move files between directories');
			throw vscode.FileSystemError.NoPermissions();
		}
		if (isLeaf(entry)) {
		  entry.rename(newName,options);
			this.hc3!.debug(`renamed: ${oldUri.path} to ${newUri.path}`);
			return;
		}
		throw vscode.FileSystemError.FileNotFound();
	}
	
	async delete(uri: vscode.Uri): Promise<void> {
		this.isInited();
		const entry = await this.hc3!.lookup(uri.path, false);
		if (isLeaf(entry)) {
			entry.delete();
			this.hc3!.debug('deleted: ' + uri.path);
			return;
		}
		throw vscode.FileSystemError.FileNotFound();
	}
	
	// copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
	// 	this.debug('copy: ' + source.path,LOGCOLOR);
	// 	throw vscode.FileSystemError.NoPermissions;
	// }
	
	async createDirectory(uri: vscode.Uri): Promise<void> {
		this.isInited();
		let [dir, name] = this.splitPath(uri);
		const entry = await this.hc3!.lookup(dir, false);
		if (isNode(entry)) {
			await entry.createLeaf(name);
		}
		throw vscode.FileSystemError.FileNotFound();
	}
	
}


