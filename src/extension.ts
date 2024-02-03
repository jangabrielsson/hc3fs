'use strict';

import * as vscode from 'vscode';

import { HC3FS } from './fileSystemProvider';
import { HC3 } from './hc3';

export function activate(context: vscode.ExtensionContext) {

	console.log('hc3fs says "Hello"');
	let conf = vscode.workspace.getConfiguration('files');
	conf.update('autoSave', 'off');

	conf = vscode.workspace.getConfiguration('hc3fs');

	const u = vscode.Uri.parse(conf.url);
	const hc3 = new HC3(conf);
	hc3.callHC3("GET", "/settings/info/").then((data) => {
		console.log("HC3 version: " + data.softVersion);
	}).catch((err) => {
		vscode.window.showErrorMessage(err);
	});
	const hc3Fs = new HC3FS(hc3);
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('hc3fs', hc3Fs, { isCaseSensitive: true }));

	// context.subscriptions.push(vscode.commands.registerCommand('hc3fs.reset', _ => {
	// 	for (const [name] of hc3Fs.readDirectory2(vscode.Uri.parse('hc3fs:/'))) {
	// 		hc3Fs.delete(vscode.Uri.parse(`hc3fs:/${name}`));
	// 	}
	// 	initialized = false;
	// }));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.init', _ => {
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.workspaceInit', _ => {
		vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('hc3fs:/'), name: `HC3FS - ${conf.url}` });
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.toggleLog', _ => {
		hc3.toggleLog();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.downloadFQA', spec => {
		hc3.downloadFQA(spec);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.downloadScene', spec => {
		hc3.downloadScene(spec);
	}));
}

