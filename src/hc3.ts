/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { COLORMAP } from './colorMap';
import { QAFile, QA, QADir } from './QA';
import { SceneFile, Scene, SceneDir } from './Scene';
import { printHC3ConsoleChannel, printHC3EventsChannel, printHC3fslogChannel } from './extension';
import { stringify } from 'querystring';

const LOGCOLOR = 'blue';

export function isNode(item: any): item is Node {
  return true;
}

export function isLeaf(item: any): item is Leaf {
  return true;
}

export class RootDirectory implements vscode.FileStat {
  type = vscode.FileType.Directory;
  ctime = Date.now();
  mtime = Date.now();
  size = 0;
  permissions?: vscode.FilePermission;
  name: string;
  entries = new Map<string, Entry>();

  constructor(name: string) {
    this.name = name;
    this.permissions = vscode.FilePermission.Readonly;
  }

  delete() {
    console.log('delete');
  }

  rename(newName: string, options: { overwrite: boolean }) {
    console.log('rename');
  }

  createLeaf(name: string): any {
    throw new Error('Method not implemented.');
  }

  async initialize() {
  }
}

export type Entry = QAFile | QA | QADir | SceneFile | Scene | SceneDir | RootDirectory;
export type Node = QADir | SceneDir | RootDirectory;
export type Leaf = QAFile | SceneFile;

export class HC3 {
	root = new RootDirectory('');
	vdir: string;
	path: string;
	creds: string;
	debugFlag: boolean;
	allowDirs: boolean = false;
	hc3LogFlag = false;
	hc3LogTimeStamp = Math.floor(Date.now() / 1000);

	tags: Map<string, boolean> = new Map();
  qas: QADir;
  scenes: SceneDir;

	constructor(conf: vscode.WorkspaceConfiguration) {
		this.path = conf.url+"api";
		this.vdir = conf.vdir;
		this.creds = "Basic " + Buffer.from(`${conf.user}:${conf.password}`).toString('base64');
		this.debugFlag = conf.debug || true;
		this.hc3LogFlag = conf.hc3log || true;
		this.hc3LogPoller(); 				// start log polling
		this.refreshStatePoller();  // start refreshStates polling

    this.qas = new QADir(this);
    this.scenes = new SceneDir(this);
    this.root.entries.set('QuickApps', this.qas);
    this.root.entries.set('Scenes', this.scenes);

    this.qas.initialize();
	}

  async lookup(path: string, silent: boolean): Promise<Entry | undefined> {
    if (path === '/') { return this.root; }
    else {
      const parts = path.split('/');
      let entry: Entry = this.root;
      for (const part of parts) {
        if (!part) { continue; }
        let child: Entry | undefined;
        if (isNode(entry)) {
          child =  entry.entries.get(part);
        }
        if (!child) {
          if (!silent) {
            throw vscode.FileSystemError.FileNotFound(vscode.Uri.parse(path));
          } else {
            return undefined;
          }
        }
        entry = child;
        const _ = await entry.initialize();
      }
      return entry;
    }
  }

	colorText(color: string, text: string) {
		return `${COLORMAP[color]}${text}\u001b[0m`;
	}

	initFlag: boolean = false;
	initResolve?: () => void;
	initPromise: Promise<void> = new Promise<void>((resolve, reject) => this.initResolve = resolve);

	initialized() {
		this.initFlag = true;
		this.debug('initialized');
		this.initResolve!();
	}

	async waitForInit(): Promise<void> {
		if (this.initFlag) {
			return Promise.resolve();
		}
		return this.initPromise;
	}

	logEvents(msg: string) {
		printHC3EventsChannel(msg);
	}

	debug(msg: string) {
		if (this.debugFlag) {
			printHC3fslogChannel(msg);
			console.log(msg);
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
						if (this.tags.get(m.tag) === undefined) {
							this.tags.set(m.tag, false);
						}
						// this.debug(`hc3log: ${m.tag}`);
						if (this.tags.get(m.tag) && m.tag.startsWith('QUICKAPP') && !m.message.includes('PluginChangedViewEvent')) {
							const time = new Date(1000*m.timestamp).toLocaleTimeString();
							printHC3ConsoleChannel(time,m.type,m.tag,m.message);
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
			const url = `/refreshStates?last=${last}`;
			try {
				const data = await this.callHC3("GET",url);
				last = data.last;
				for (const event of data.events || []) {
					if (this.debugFlag) {
						this.logEvents(`event: ${event.type}`);
					}
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
    const qa = await this.lookup(spec.path,false) as QA;
    const FILE = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(qa!.qaName),
      filters: {
        'QA': ['fqa']
      },
      saveLabel: 'Save QA To ...'
    });
    if (FILE) {
      qa.saveToFile(FILE.fsPath);
      this.debug(`downloaded ${qa!.qaName}.fqa`);
    }
  }

  async downloadScene(spec: any) {
    const scene = await this.lookup(spec.path,false) as Scene;
    const FILE = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(scene!.sname),
      filters: {
        'Scene': ['scene']
      },
      saveLabel: 'Save QA To ...'
    });
    if (FILE) {
      scene.saveToFile(FILE.fsPath);
      this.debug(`downloaded ${scene!.sname}.scene`);
    }
  }

	async toggleReadOnly(spec: any) {
		const qaFile = await this.lookup(spec.path,false) as QAFile;
		qaFile.toggleReadOnly();
	}

	async resyncQA() {
		this.qas.resync();
	}

	async resyncScenes() {
		this.scenes.resync();
	}
}


