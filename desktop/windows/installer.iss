; Standard Inno installer. No packer, certificate import, security exclusions or driver.
; Side-by-side DLL retirement follows upstream apps/windows/installer/qingjian.iss.
#ifndef StageRoot
  #error StageRoot is required
#endif
#define TsfDll "ciban-tsf-" + Product + "-" + AppVersion + ".dll"
#define TsfDll32 "ciban-tsf-" + Product + "-" + AppVersion + "-x86.dll"

[Setup]
AppId={#ProductAppId}
AppName={#ProductName}
AppVersion={#AppVersion}
AppPublisher=Ciban Project
AppSupportURL=https://maxnote.top/ciban/
VersionInfoVersion=0.1.0.1
VersionInfoDescription={#ProductName} 测试版安装程序
DefaultDirName={autopf}\{#ProductDirectory}
DefaultGroupName={#ProductName}
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
PrivilegesRequired=admin
CloseApplications=no
RestartApplications=no
OutputDir={#OutputRoot}
OutputBaseFilename=ciban-{#Product}-{#AppVersion}-windows-x64-setup
SetupIconFile={#StageRoot}\ciban.ico
UninstallDisplayIcon={app}\ciban.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
LicenseFile={#StageRoot}\licenses\GPL-3.0.txt
InfoBeforeFile={#StageRoot}\测试说明.txt
SetupLogging=yes

[Languages]
Name: "chs"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Messages]
FinishedLabel=词伴安装完成。关闭后重新打开要打字的应用，按 Win + 空格选择「{#ProductName}」。%n%n旧应用若未出现词伴，请注销后重新登录。开始菜单中的「{#ProductName}设置与试打」可随时打开。英语与法语可以同时安装。测试版尚未签名。

[Tasks]
Name: "startup"; Description: "登录后启动词伴（也可在选用输入法时自动启动）"; Flags: unchecked

[Files]
Source: "{#StageRoot}\tsf-x64.dll"; DestDir: "{app}"; DestName: "{#TsfDll}"; Flags: ignoreversion uninsrestartdelete
Source: "{#StageRoot}\tsf-x86.dll"; DestDir: "{app}"; DestName: "{#TsfDll32}"; Flags: ignoreversion uninsrestartdelete
Source: "{#StageRoot}\runtime\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\{#SettingsExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageRoot}\ciban.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageRoot}\data\*"; DestDir: "{app}\data"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\licenses\*"; DestDir: "{app}\licenses"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\测试说明.txt"; DestDir: "{app}"; Flags: ignoreversion
; Server is last: old loaded DLLs cannot relaunch it during upgrade.
Source: "{#StageRoot}\{#ServerExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#ProductName}设置与试打"; Filename: "{app}\{#SettingsExe}"; IconFilename: "{app}\ciban.ico"
Name: "{group}\卸载{#ProductName}"; Filename: "{uninstallexe}"
Name: "{commonstartup}\{#ProductDirectory}"; Filename: "{app}\{#ServerExe}"; WorkingDir: "{app}"; Tasks: startup

[Run]
Filename: "{app}\{#SettingsExe}"; Parameters: "--enable-profile"; Description: "启用词伴并打开设置与试打"; Flags: postinstall nowait skipifsilent runasoriginaluser

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/im {#ServerExe} /f"; Flags: runhidden waituntilterminated; RunOnceId: "Server"
Filename: "{sys}\taskkill.exe"; Parameters: "/im {#SettingsExe} /f"; Flags: runhidden waituntilterminated; RunOnceId: "Settings"
Filename: "{sys}\regsvr32.exe"; Parameters: "/u /s ""{app}\{#TsfDll}"""; Flags: runhidden waituntilterminated; RunOnceId: "TSF64"
Filename: "{syswow64}\regsvr32.exe"; Parameters: "/u /s ""{app}\{#TsfDll32}"""; Flags: runhidden waituntilterminated; RunOnceId: "TSF32"

[UninstallDelete]
Type: files; Name: "{app}\ciban-tsf-*.dll"
Type: files; Name: "{app}\{#ServerExe}.old-*.exe"

[Code]
function CreateMutex(Attributes: Longint; InitialOwner: BOOL; Name: String): THandle;
  external 'CreateMutexW@kernel32.dll stdcall';

procedure HoldInstallerMutex;
begin
  if CreateMutex(0, False, 'Global\{#ProductDirectory}Installer') = 0 then
    RaiseException('无法建立安装互斥体，请重试。');
end;

function InitializeSetup: Boolean;
begin
  HoldInstallerMutex;
  Result := True;
end;

function InitializeUninstall: Boolean;
begin
  HoldInstallerMutex;
  Result := True;
end;

procedure Retire(const Name: String);
var Path: String;
begin
  Path := ExpandConstant('{app}\') + Name;
  if FileExists(Path) then
    if not RenameFile(Path, Path + '.old-' + IntToStr(Random(1000000)) + ExtractFileExt(Name)) then
      RaiseException('文件被占用，无法升级：' + Path + '。请关闭词伴设置或重新启动电脑后重试。');
end;

procedure Kill(const Name: String);
var Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/im ' + Name + ' /f', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  try
    Retire('{#ServerExe}');
    Kill('{#ServerExe}');
    Kill('{#SettingsExe}');
    Retire('{#TsfDll}');
    Retire('{#TsfDll32}');
  except
    Result := GetExceptionMessage;
  end;
end;

procedure RegisterDll(const Tool, Name: String);
var Code: Integer;
begin
  if not Exec(ExpandConstant(Tool), '/s "' + ExpandConstant('{app}\') + Name + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) then
    RaiseException('无法运行系统注册程序，请重新安装。');
  if Code <> 0 then
    RaiseException('输入法注册失败，返回码 ' + IntToStr(Code) + '。请查看安装日志或卸载后重试。');
end;

procedure DeleteStale(const Pattern: String);
var Found: TFindRec; Path: String;
begin
  if FindFirst(ExpandConstant('{app}\') + Pattern, Found) then
  begin
    try
      repeat
        if (CompareText(Found.Name, '{#TsfDll}') <> 0) and (CompareText(Found.Name, '{#TsfDll32}') <> 0) then
        begin
          Path := ExpandConstant('{app}\') + Found.Name;
          if not DeleteFile(Path) then RestartReplace(Path, '');
        end;
      until not FindNext(Found);
    finally FindClose(Found); end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Code: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    if not Exec(ExpandConstant('{sys}\icacls.exe'), '"' + ExpandConstant('{app}') + '" /grant *S-1-15-2-1:(OI)(CI)RX /T /C /Q', '', SW_HIDE, ewWaitUntilTerminated, Code) then
      RaiseException('无法配置输入法目录的只读权限。');
    if Code <> 0 then RaiseException('配置输入法只读权限失败。');
    RegisterDll('{sys}\regsvr32.exe', '{#TsfDll}');
    RegisterDll('{syswow64}\regsvr32.exe', '{#TsfDll32}');
    DeleteStale('ciban-tsf-*.dll*');
    DeleteStale('{#ServerExe}.old-*.exe');
  end;
end;

procedure CurUninstallStepChanged(CurStep: TUninstallStep);
begin
  if CurStep = usUninstall then Retire('{#ServerExe}');
end;
