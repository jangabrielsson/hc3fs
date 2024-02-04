# hc3fs README

This is a fileSystemProvider extension for vscode that "mounts" the Fibaro HC3 as a fileSystem making it available in the vscode File Explorer.
Currently only QuickApps and Scenes are availabe.

## Features

Allow you to edit and manage QuickApp files from within vscode.
Optional, all HC3 logs can be funneled into the vscode terminal so this way QA files can be edited, saved, and the effect be seen in the vscode Terminal. In principle allowing you use vscode as the editor when developing QAs on the HC3. Enabling Logs are done in settings or with the options in the Terminals context menu

QAs can be downloaded as a .fqa using the File explorer context menu

There is also rudimentary support to view Scenes.

Note. Autosave is turned off by default and file are synched to the HC3 when explicitly saved.

## Requirements

You need the URL of your HC3, ex. http://192.168.1.57/.
You need to admin username and password

## Usage

Configure settings and run command 'hc3fs: Setup Workspace, from Command Palette

- Logs written to LogOutputChannels
  - Output: 'HC3 Console' console logs from the HC3
  - Output: 'HC3 Events' events from HC3 (refreshState)
  - Output: 'HC3 hc3fs' logs from the hc3fs extension

Command Palette commands
- 'hc3fs: Setup Workspace' 
  - Mounts the HC3 filesystem
- 'hc3fs: Filter HC3 logs on tags' 
  - Shows pick list for tags that should be shown in the 'HC3 Console' output channel

File explorer context commands
- 'hc3: Download .fqa'
  - Only when QuickApp (folder)
- 'hc3: Download Scene'
  - Only when Scene (folder)
- 'hc3: Toggle read only for file'
  - Only QuickApp .lua files  

## Extension Settings

This extension contributes the following settings:

* `hc3fs.url`: Set to URL of HC3.
* `hc3fs.user`: Set to username for HC3.
* `hc3fs.password`: Set to password for HC3.
* `hc3fs.hc3log`: true/false if logs from HC3 should be displayed in terminal window.
* `hc3fs.debug`: Enables extra debug logs of hc3fs file operations.


## Known Issues

Still early in development.
No sync back when QAs changed on the HC3.
QAs can't be created,deleted or renamed in vscode.

**Enjoy!**
