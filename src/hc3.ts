/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import { sep } from 'path';
import { API } from './api';
import { 
	logConsole, logfs, logEvents, Gate, Lock, StringBuffer, fileExist
} from './utils';
import { read } from 'fs';
import { log } from 'console';
import { Resolver, getResolvers } from './resolvers';

export class HC3 implements vscode.Disposable {
	api: API;
	fdir?: string;
	gate = new Gate();

	hc3LogTimeStamp = Math.floor(Date.now() / 1000);
	hc3LogFlag = true;
	
	tags: Map<string, boolean> = new Map();

	resolveMap: Map<string, Resolver[]> = new Map(); // path -> resolvers

	constructor(conf: vscode.WorkspaceConfiguration) {
		const base = conf.url+"api";
		const creds = "Basic " + Buffer.from(`${conf.user}:${conf.password}`).toString('base64');
		this.api = new API(base, creds);
		this.hc3LogPoller(); 				// start log polling
		this.refreshStatePoller();  // start refreshStates polling
		
		this.resolveMap = getResolvers(this);
		this.createFdir().then(() => {
			this.initialiseData();
		});
	}
	
	dispose() {
		try {
			fs.rmdir(this.fdir!, {recursive: true});
			logfs(`removed fdir: ${this.fdir}`);
		} catch (err) {
			this.debug(`failed removing fdir: ${err}`);
		}
	}

	debug(msg: string) {
		logfs(msg);
	}
	
	private async createFdir() {
		// Get the temporary directory of the system 
		const tmpDir = os.tmpdir();  
		const s = sep;
		this.fdir = await fs.mkdtemp(`${tmpDir}${s}`);
		vscode.workspace.workspaceFolders?.forEach(async (wf) => {
			logfs(`folders: ${wf.uri.scheme} ${wf.uri.path}`);
			if (wf.uri.path.endsWith('fibemu')) {
				const ft = vscode.Uri.parse(`${wf.uri.path}${s}.fdir.txt`);
				const fdirData = Buffer.from(this.fdir!);
				await vscode.workspace.fs.writeFile(ft,fdirData);
			}
		});
		logfs(`fdir: ${this.fdir}`);
	}
	
	startDebugging() {
		this.debug('startDebugging');
		fs.writeFile(`${os.tmpdir}/hc3fs.path`, Buffer.from(this.fdir || ''));
	}

	async createDir(path: string) {
		await vscode.workspace.fs.createDirectory(vscode.Uri.parse(this.fdir+path));
		logfs(`created local dir: ${path}`);
	}
	
	async writeFile(path: string, data: Uint8Array) {
		await vscode.workspace.fs.writeFile(vscode.Uri.parse(this.fdir+path),data);
		logfs(`wrote local file: ${path}`);
	}

	async readFile(path: string): Promise<Uint8Array> {
		return await vscode.workspace.fs.readFile(vscode.Uri.parse(this.fdir+path));
		logfs(`read local file: ${path}`);
	}
	
	private async initialiseData() {
		try {
			await this.createDir('/QuickApp');
			await this.createDir('/Scene');
			this.gate.open();
		} catch (err) {
			this.debug(`initialiseDirectories failed: ${err}`);
		}
	}
	
	lock = new Lock();
	async resolvePath(path: string, read = false): Promise<Resolver | void> {
		if (path === '/') { return;}
		const parts = path.split('/');
		let currPath = "";
		if (parts[0] === '') { parts.shift(); }
		const resolvers = this.resolveMap.get(parts[0] || '');
		if (!resolvers) { 
			throw vscode.FileSystemError.FileNotFound();
		}
		await this.lock.aquire(async () => { // critical section
			for (let i = 0; i < parts.length; i++) {
				currPath += "/"+parts[i];
				await resolvers[i].resolve(currPath,read);
			} 
		});
		return resolvers[parts.length-1];
	}

	toggleLog() {
		this.hc3LogTimeStamp = Math.floor(Date.now() / 1000);
		this.hc3LogFlag = !this.hc3LogFlag;
	}	
	
	private hc3LogPoller(interval: number = 1000*1) {
		setInterval(async () => {
			if (!this.hc3LogFlag) { return; }
			try {
				const res = await this.api.getDebugMessages(this.hc3LogTimeStamp); // fetch new logs from the HC3
				const msg = res as any;
				if (msg && msg.messages) {
					for (let i = msg.messages.length-1; i >= 0; i--) {
						const m = msg.messages[i];
						this.hc3LogTimeStamp = m.timestamp;
						m.message = m.message.replace(/&nbsp;/g, ' '); // fix spaces
						m.message = m.message.replace(/<br>/g, '\n'); // fix spaces
						if (this.tags.get(m.tag) === undefined) {
							this.tags.set(m.tag, false);
						}
						// this.debug(`hc3log: ${m.tag}`);
						if (this.tags.get(m.tag) && m.tag.startsWith('QUICKAPP') && !m.message.includes('PluginChangedViewEvent')) {
							const time = new Date(1000*m.timestamp).toLocaleTimeString();
							logConsole(time,m.type,m.tag,m.message);
						}
					}
					this.hc3LogTimeStamp = msg.timestamp ? msg.timestamp : this.hc3LogTimeStamp;
				}
			} catch (err) {
				this.debug(`log fetch failed: ${err}`);
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
		let nerr = 0;
		let last = 0;
		while (nerr < 1000) {
			try {
				const data = await this.api.getRefresh(last);
				last = data.last;
				for (const event of data.events || []) {
					logEvents(`${event.type}`);
					if (event.type === 'QuickAppFilesChangedEvent') {
						this.HC3filesChanged(event.data.id);
					} else if (event.type === 'DeviceCreatedEvent') {
						this.HC3QAcreated(event.data.id);
					} else if (event.type === 'DeviceRemovedEvent') {
						this.HC3QAremoved(event.data.id);
					}
				}
			} catch (err) {
				nerr += 1;
				this.debug(`refreshStates failed: ${err}`);
			}
			await new Promise(f => setTimeout(f, 1000));
		} // while
		this.debug('refreshStatesPoller terminated, too many access errors');
	}
	
	_emitter?: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	private _bufferedEvents: vscode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timer;
	
	_fireSoon(...events: vscode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);
		
		if (this._fireSoonHandle) {
			clearTimeout(Number(this._fireSoonHandle));
		}
		
		this._fireSoonHandle = setTimeout(() => {
			this._emitter!.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}
	
	// commands
	
	async logFilterPicker() {
		let i = 0;
		let tags: vscode.QuickPickItem[] = [];
		this.tags.forEach((value: boolean, key: string) => {
			tags.push({label: key, picked: value});
		});
		
		const result = await vscode.window.showQuickPick(tags, {
			placeHolder: 'Select tags to show in the log',
			canPickMany: true,
		});
		this.tags.forEach((value: boolean, key: string) => {
			this.tags.set(key, false);
		});
		for (const tag of result || []) {
			this.debug(`enablig tag: ${tag.label}`);
			this.tags.set(tag.label, true);
		}
	}
	
	async downloadFQA(spec: any) {
		const doc = vscode.window.activeTextEditor?.document;
		logfs(`downloadFQA: ${doc?.fileName}`);

		// const qa = await this.lookup(spec.path,false) as QA;
		// const FILE = await vscode.window.showSaveDialog({
		//   defaultUri: vscode.Uri.file(qa!.qaName),
		//   filters: {
		//     'QA': ['fqa']
		//   },
		//   saveLabel: 'Save QA To ...'
		// });
		// if (FILE) {
		//   qa.saveToFile(FILE.fsPath);
		//   this.debug(`downloaded ${qa!.qaName}.fqa`);
		// }
	}
	
	async downloadScene(spec: any) {
		// const scene = await this.lookup(spec.path,false) as Scene;
		// const FILE = await vscode.window.showSaveDialog({
		//   defaultUri: vscode.Uri.file(scene!.sname),
		//   filters: {
		//     'Scene': ['scene']
		//   },
		//   saveLabel: 'Save QA To ...'
		// });
		// if (FILE) {
		//   scene.saveToFile(FILE.fsPath);
		//   this.debug(`downloaded ${scene!.sname}.scene`);
		// }
	}
}


