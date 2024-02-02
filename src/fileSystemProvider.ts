/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/


import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { COLORMAP } from './colorMap';

const LOGCOLOR = 'blue';

export class File implements vscode.FileStat {
	
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	qaID: number;
	qaName: string;
	initialized: boolean;
	
	name: string;
	data?: Uint8Array;
	permissions?: vscode.FilePermission;
	
	constructor(name: string) {
		this.type = vscode.FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.initialized = false;
		this.qaID = 0;
		this.qaName = name.replace(/\.[^/.]+$/, "");
	}
}

export class Directory implements vscode.FileStat {
	
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	qaID: number;
	qaName: string;
	initialized: boolean;
	permissions?: vscode.FilePermission;

	name: string;
	entries: Map<string, File | Directory>;
	
	constructor(name: string, id: number = 0, qname: string = '') {
		this.type = vscode.FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.qaID = id;
		this.qaName = qname;
		this.initialized = false;
		this.entries = new Map();
		if (name === "") {
			this.permissions = vscode.FilePermission.Readonly;
		}
	}
}

export type Entry = File | Directory;

export class HC3FS implements vscode.FileSystemProvider {
	root = new Directory('');
	vdir: string;
	path: string;
	creds: string;
	debugFlag: boolean;
	allowDirs: boolean = false;
	hc3LogFlag = false;
	hc3LogTimeStamp = Math.floor(Date.now() / 1000);

	constructor(user: string, pwd: string = "", url: string = '', vdir: string = '', hlog: boolean = false, debug: boolean = false) {
		this.path = url+"api";
		this.vdir = vdir;
		this.creds = "Basic " + Buffer.from(`${user}:${pwd}`).toString('base64');
		this.debugFlag = debug || true;
		this.hc3LogFlag = hlog;
		this.hc3LogPoller(); 				// start log polling
		this.refreshStatePoller();  // start refreshStates polling
		this.root.initialized = true;
	}
	
	colorText(color: string, text: string) {
		return `${COLORMAP[color]}${text}\u001b[0m`;
	}

	initFlag: boolean = false;
	initResolve?: () => void;
	initPromise: Promise<void> = new Promise<void>((resolve, reject) => this.initResolve = resolve);

	initialized() {
		this.initFlag = true;
		this.debug('initialized',LOGCOLOR);
		this.initResolve!();
	}

	async waitForInit(): Promise<void> {
		if (this.initFlag) {
			return Promise.resolve();
		}
		return this.initPromise;
	}

	log(msg: string, color: string = 'white') {
		console.log(this.colorText(color,msg));
	}

	debug(msg: string, color: string = 'blue') {
		if (this.debugFlag) {
			console.log(this.colorText(color,msg));
		}
	}
	
	async callHC3(method: string, path: string, data?: string) : Promise<any> {
		const resp = await fetch(this.path+path, {
			method: method,
			headers: {
				'authorization': this.creds,
				'content-type': 'application/json',
				'X-Fibaro-Version': '2',
				'accept': '*/*',
			},
			body: data,
		});
		if (resp.ok) {
			const data = await resp.text(); // Some calls return empty response but status ok
			if (data && data.length > 0) {
				return JSON.parse(data);
			} else {
				return null;
			}
		} else {
			throw new Error(`${resp.status} - ${resp.statusText}`);
		}
	}
	
	private async fetchQAfiles(id: number, name: string, entry: Directory): Promise<Directory> {
		try {
			const res = await this.callHC3("GET",`/quickApp/${id}/files`);
			const data = res as Array<any>;
			for (const file of data) {
				//this.debug(`fetched QA:${id}.file:${file.name} info`,LOGCOLOR);
				const fname = `hc3fs:/${id}_${name}/${file.name}.lua`;
				// Create empty placeholders for the files - fetch when opened
				this.writeFile(vscode.Uri.parse(`${fname}`), Buffer.from(""), { create: true, overwrite: true, placeholder: true });
				const f: File = this._lookup(vscode.Uri.parse(fname), false) as File;
				// ToDo. update parent/QA/dir size
				f.initialized = false;
				f.size = 0;
				f.qaID = id;
				f.qaName = file.name;
			}
			entry.initialized = true;
			return entry;
		} catch (err) {
				throw err;
		}
	}
	
	private async fetchQAfile(uri: vscode.Uri, id: number, name: string, entry: File): Promise<File> {
		try {
			const res = await this.callHC3("GET",`/quickApp/${id}/files/${name}`);
			const file = res as any;
			entry.data = Buffer.from(file.content);
			entry.mtime = Date.now();
			entry.size = entry.data.byteLength;
			entry.initialized = true;
			this.debug(`fetched QA:${id}.file:${name} content (${entry.size} bytes)`,LOGCOLOR);
			this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
			return entry;
		} catch (err) {
			throw err;
		}
	}
	
	private updateQAfile(id: number, name: string, content: Uint8Array): Thenable<any> {
		const data = {
			content: content.toString(),
			type: 'lua',
			name: name,
			isOpen : false,
			isMain: false,
		};
		return this.callHC3("PUT",`/quickApp/${id}/files/${name}`, JSON.stringify(data));
	}
	
	private async createQAfile(id: number, name: string, content: Uint8Array): Promise<any>  {
		const data = {
			content: content.toString(),
			type: 'lua',
			name: name,
			isOpen : false,
			isMain: false,
		};
		const d = JSON.stringify(data);
		const resp = await this.callHC3("POST",`/quickApp/${id}/files`, d);
		return await resp.json();
	}
	
	toggleLog() {
		this.hc3LogTimeStamp = Math.floor(Date.now() / 1000);
		this.hc3LogFlag = !this.hc3LogFlag;
	}	

	private hc3LogPoller(interval: number = 1000*1) {
		setInterval(async () => {
			if (!this.hc3LogFlag) { return; }
			try {
				const res = await this.callHC3("GET",`/debugMessages?from=${this.hc3LogTimeStamp}`); // fetch new logs from the HC3
				const msg = res as any;
				if (msg && msg.messages) {
					for (let i = msg.messages.length-1; i >= 0; i--) {
						const m = msg.messages[i];
						this.hc3LogTimeStamp = m.timestamp;
						m.message = m.message.replace(/&nbsp;/g, ' '); // fix spaces
						m.message = m.message.replace(/<br>/g, '\n'); // fix spaces
						if (m.tag.startsWith('QUICKAPP') && !m.message.includes('PluginChangedViewEvent')) {
							const time = new Date(1000*m.timestamp).toLocaleTimeString();
							this.log(`${time}:${m.tag}: ${m.message}`);
						}
					}
					this.hc3LogTimeStamp = msg.timestamp ? msg.timestamp : this.hc3LogTimeStamp;
				}
			} catch (err) {
				this.debug(`log fetch failed: ${err}`,LOGCOLOR);
			}
		}, interval);
	}
	
	private HC3filesChanged(id: number) {
		// const name = `hc3fs:/${id}_`;
		// const uri = vscode.Uri.parse(name);
		// const entry = this._lookupAsDirectory2(uri, false);
		// this.debug(`files changed for QA:${id}`,LOGCOLOR);
		// this.fetchQAfiles(id, entry.qaName, entry);
	}

	private HC3QAcreated(id: number) {
		// const name = `hc3fs:/${id}_`;
		// const uri = vscode.Uri.parse(name);
		// const entry = this._lookupAsDirectory2(uri, false);
		// this.debug(`QA created: ${entry.qaName}`,LOGCOLOR);
		// this.fetchQAfiles(id, entry.qaName, entry);
	}

	private HC3QAremoved(id: number) {
		// const name = `hc3fs:/${id}_`;
		// const uri = vscode.Uri.parse(name);
		// const entry = this._lookupAsDirectory2(uri, false);
		// this.debug(`QA removed: ${entry.qaName}`,LOGCOLOR);
		// this.root.entries.delete(entry.name);
		// this._fireSoon({ type: vscode.FileChangeType.Deleted, uri });
	}

	private async refreshStatePoller() {
		const url = '/refreshStates';
		let last = 0;
		while (true) {
			const url = `/refreshStates?last=${last}`;
			try {
				const data = await this.callHC3("GET",url);
				last = data.last;
				for (const event of data.events) {
					this.log(`event: ${event.type}`);
					if (event.type === 'QuickAppFilesChangedEvent') {
						this.HC3filesChanged(event.data.id);
					} else if (event.type === 'DeviceCreatedEvent') {
						this.HC3QAcreated(event.data.id);
					} else if (event.type === 'DeviceRemovedEvent') {
						this.HC3QAremoved(event.data.id);
					}
				}
			} catch (err) {
				this.debug(`refreshStates failed: ${err}`,LOGCOLOR);
			}
		}
	}

	// --- manage file metadata
	
	stat(uri: vscode.Uri): vscode.FileStat {
		// this.debug('stat: ' + uri.path,LOGCOLOR);
		return this._lookup(uri, false);
	}
	
	async readDirectory(uri: vscode.Uri): Promise<Array<[string, vscode.FileType]>> {
		//this.debug('readDirectory: ' + uri.path,LOGCOLOR);
		const entry = await this._lookupAsDirectory(uri, false);
		const result: [string, vscode.FileType][] = [];
		for (const [name, child] of entry.entries) {
			result.push([name, child.type]);
		}
		return result;
	}

	// --- manage file contents
	
	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.path.startsWith('/.vscode')) {
			const filePath = this.vdir + uri.path;
			try {
				this.debug('read fs file: ' + uri.path,LOGCOLOR);
				const fileContent = fs.readFileSync(filePath);
				return Uint8Array.from(fileContent);
			} catch (e) {
				throw vscode.FileSystemError.FileNotFound();
			}
		}
		const inited = await this.waitForInit();
		const data = await this._lookupAsFile(uri, false);
		return data.data!;
	}
	
	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean, placeholder?: boolean }): Promise<void> {
		const basename = path.posix.basename(uri.path);
		const parent = this._lookupParentDirectory(uri);
		if (parent.permissions === vscode.FilePermission.Readonly) {
			throw vscode.FileSystemError.NoPermissions(uri);
		}
		let entry = parent.entries.get(basename);
		if (entry instanceof Directory) {
			throw vscode.FileSystemError.FileIsADirectory(uri);
		}
		if (!entry && !options.create) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		if (entry && options.create && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(uri);
		}
		if (basename !== '.rsrc.json' && !basename.endsWith('.lua')) {
			throw vscode.FileSystemError.Unavailable(uri);
		}
		if (!entry) {
			entry = new File(basename);
			entry.qaID = parent.qaID;
			entry.data = content;
			entry.size = content.byteLength;
			entry.mtime = Date.now();
			entry.initialized = options.placeholder !== true;
			if (basename.endsWith('.lua') && !options.placeholder) { // QA lua files
				this.debug(`creating QA:${parent.qaID}.file:${entry.qaName} (${entry.size} bytes)`,LOGCOLOR);
				try {
					const resp = await this.createQAfile(parent.qaID, entry.qaName, content);
					parent.entries.set(basename, entry!);
					this._fireSoon({ type: vscode.FileChangeType.Created, uri });
					this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
				} catch (err) {
						this.debug(`create failed: ${err}`,LOGCOLOR);
						throw err;
				}
			} else {  // .rsrc and lua placeholders
				if (options.placeholder) {
					this.debug(`creating placeholder QA:${parent.qaID}.file:${entry.qaName} (${entry.size} bytes)`,LOGCOLOR);
				} else {
					this.debug(`creating local QA:${parent.qaID}.file:${entry.qaName} (${entry.size} bytes)`,LOGCOLOR);
				}
				parent.entries.set(basename, entry);
				if (!basename.endsWith('.lua')) {
					entry.permissions = vscode.FilePermission.Readonly;
				}
				this._fireSoon({ type: vscode.FileChangeType.Created, uri });
				this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
			}

		} else if (entry instanceof File && basename.endsWith('.lua') && entry.initialized) {
			this.debug(`updating QA:${entry.qaID}.file:${entry.qaName} (${content.byteLength} bytes)`,LOGCOLOR);
			try {
				const resp = await this.updateQAfile(entry.qaID, entry.qaName, content);
				if (entry instanceof File) {
					entry.mtime = Date.now();
					entry.size = content.byteLength;
					entry.data = content;
		    	this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
				}
			} catch (err) {
				this.debug(`update failed: ${err}`,LOGCOLOR);
				throw err;
			}
		} else if (entry instanceof File && !entry.initialized) {
			this.debug(`Ignoring file update for ${entry.qaName} - not initialized`,LOGCOLOR);
		}
	}
	
	// --- manage files/folders
	
	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		if (!options.overwrite && this._lookup(newUri, true)) {
			throw vscode.FileSystemError.FileExists(newUri);
		}
		
		const entry = this._lookup(oldUri, false);
		const oldParent = this._lookupParentDirectory(oldUri);
		
		if (entry instanceof Directory) {
			throw vscode.FileSystemError.NoPermissions(`can't rename QA directory: ${oldUri.path}`);
		}

		if (entry.permissions === vscode.FilePermission.Readonly) {
			throw vscode.FileSystemError.NoPermissions;
		}

		const newParent = this._lookupParentDirectory(newUri);
		const newName = path.posix.basename(newUri.path);
		
		if (oldParent.qaID !== newParent.qaID) {
			throw vscode.FileSystemError.NoPermissions;
		}

		let qaName = newName.replace(/\.[^/.]+$/, "");

		try {
			const resp = await this.callHC3("PUT",`/quickApp/${oldParent.qaID}/files/${entry.qaName}`, `{"name":"${qaName}"}`);
			this.debug(`renamed: ${entry.qaName} to ${qaName}`,LOGCOLOR);
			oldParent.entries.delete(entry.name);
			entry.name = newName;
			newParent.entries.set(newName, entry);
			this._fireSoon({ type: vscode.FileChangeType.Deleted, uri: oldUri },{ type: vscode.FileChangeType.Created, uri: newUri });
		} catch (err) {
			this.debug(`rename failed: ${err}`,LOGCOLOR);
			throw vscode.FileSystemError.NoPermissions(`failed renaiming ${oldUri.path} to ${newUri.path}`);
		}
	}
	
	async delete(uri: vscode.Uri): Promise<void> {
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		const basename = path.posix.basename(uri.path);
		const parent = this._lookupAsDirectory2(dirname, false);
		if (!parent.entries.has(basename)) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		const entry = parent.entries.get(basename)!;
		try {
			const resp = await this.callHC3("DELETE",`/quickApp/${parent.qaID}/files/${entry.qaName}`,"{}");
			this.debug('deleted: ' + uri.path,LOGCOLOR);
			parent.entries.delete(basename);
			parent.mtime = Date.now();
			parent.size -= 1;
			this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { uri, type: vscode.FileChangeType.Deleted });
		} catch(err) {
			this.debug(`delete failed: ${err}`,LOGCOLOR);
			throw err;
		}
	}
	
	// copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
	// 	this.debug('copy: ' + source.path,LOGCOLOR);
	// 	throw vscode.FileSystemError.NoPermissions;
	// }
	
	createDirectory(uri: vscode.Uri): void {
		if (!this.allowDirs) {
			vscode.window.showErrorMessage(`Not allowed to create QA directory: ${uri.path}`);
			throw vscode.FileSystemError.NoPermissions;
		}
		const basename = path.posix.basename(uri.path);
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		const parent = this._lookupAsDirectory2(dirname, false);
		
		const entry = new Directory(basename);
		this.debug('created QA: ' + uri.path,LOGCOLOR);
		const match = basename.match(/(\d+)_(.*)/i);
		entry.qaID = Number(match?.[1]);
		entry.qaName = match?.[2] || '';
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri });
	}
	
	// --- lookup
	
	private _lookup(uri: vscode.Uri, silent: false): Entry;
	private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined;
	private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined {
		// this.debug('lookup: ' + uri.path,LOGCOLOR);
		const parts = uri.path.split('/');
		let entry: Entry = this.root;
		for (const part of parts) {
			if (!part) {
				continue;
			}
			let child: Entry | undefined;
			if (entry instanceof Directory) {
				child = entry.entries.get(part);
			}
			if (!child) {
				if (!silent) {
					throw vscode.FileSystemError.FileNotFound(uri);
				} else {
					return undefined;
				}
			}
			entry = child;
		}
		return entry;
	}
	
	private async _lookupAsDirectory(uri: vscode.Uri, silent: boolean): Promise<Directory> {
		const entry = this._lookup(uri, silent);
		if (entry instanceof Directory) {
			if (!entry.initialized) {
				return await this.fetchQAfiles(entry.qaID,entry.qaName,entry);
			}
			return entry;
		}
		throw vscode.FileSystemError.FileNotADirectory(uri);
	}
	
	private _lookupAsDirectory2(uri: vscode.Uri, silent: boolean): Directory {
		const entry = this._lookup(uri, silent);
		if (entry instanceof Directory) {
			return entry;
		}
		throw vscode.FileSystemError.FileNotADirectory(uri);
	}
	
	private async _lookupAsFile(uri: vscode.Uri, silent: boolean): Promise<File> {
		const entry = this._lookup(uri, silent);
		if (entry instanceof File) {
			if (!entry.initialized) {
				return await this.fetchQAfile(uri, entry.qaID, entry.qaName, entry);
			} else {
				return entry;
			}
		}
		throw vscode.FileSystemError.FileIsADirectory(uri);
	}
	
	private _lookupParentDirectory(uri: vscode.Uri): Directory {
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		return this._lookupAsDirectory2(dirname, false);
	}
	
	// --- manage file events
	
	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private _bufferedEvents: vscode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timer;
	
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
	
	watch(_resource: vscode.Uri): vscode.Disposable {
		// ignore, fires for all changes...
		return new vscode.Disposable(() => { });
	}
	
	private _fireSoon(...events: vscode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);
		
		if (this._fireSoonHandle) {
			clearTimeout(Number(this._fireSoonHandle));
		}
		
		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}
}


