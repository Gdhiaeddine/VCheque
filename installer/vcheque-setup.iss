; =====================================================================
; VCheque Studio - Script d'Installation Professionnel Inno Setup
; Impression & Traitement Sécurisé de Chèques Bancaires (Algérie)
; =====================================================================

#define MyAppName "VCheque Studio"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Virtanis Technologies"
#define MyAppURL "https://cheque-studio.dz"
#define MyAppExeName "VCheque Studio.exe"

[Setup]
; Identifiant unique de l'application
AppId={{8B2F3D9C-4E7A-4B6C-8D1F-9E2A3B4C5D6E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Choix de l'emplacement d'installation par l'utilisateur
DefaultDirName={autopf}\{#MyAppName}
DisableDirPage=no
AllowNoIcons=yes
AlwaysShowDirOnReadyPage=yes

; Nom du groupe dans le menu démarrer
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no

; Fichier de sortie de l'installateur
OutputDir=..\dist-installer
OutputBaseFilename=VChequeStudio_Setup_{#MyAppVersion}
SetupIconFile=..\src-tauri\icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

; Droits d'administration recommandés pour installer dans Program Files
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Langues d'installation (Français, Anglais)
[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
french.BeveledLabel=VCheque Studio - Système Bancaire Sécurisé Algérie
english.BeveledLabel=VCheque Studio - Algerian Banking Cheque System

[CustomMessages]
french.DataDirTitle=Emplacement du Dossier de Données & Configuration
french.DataDirSubtitle=Choisissez le répertoire où seront stockées les données, modèles et sauvegardes de chèques.
french.DataDirPrompt=Dossier de stockage des données locales :
french.DesktopShortcut=Créer un raccourci sur le &Bureau
french.QuickLaunchShortcut=Créer une icône dans la barre de lancement rapide
english.DataDirTitle=Data & Configuration Folder Location
english.DataDirSubtitle=Choose the directory where cheques database, templates, and backups will be stored.
english.DataDirPrompt=Local data storage folder:
english.DesktopShortcut=Create a &Desktop shortcut
english.QuickLaunchShortcut=Create a Quick Launch shortcut

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:QuickLaunchShortcut}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Fichiers exécutables et composants compilés depuis target/release
Source: "..\src-tauri\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\src-tauri\target\release\*.dll"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Tasks: ; Check: 
Source: "..\src-tauri\target\release\resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs optional

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon

[Run]
Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Filename: "{app}\{#MyAppExeName}"; Flags: nowait postinstall skipifsilent

[Code]
var
  DataDirPage: TInputDirWizardPage;
  SelectedDataDir: String;

// Ajout d'une page pour choisir l'emplacement du dossier de données et de configuration
procedure InitializeWizard;
begin
  DataDirPage := CreateInputDirPage(
    wpSelectDir,
    CustomMessage('DataDirTitle'),
    CustomMessage('DataDirSubtitle'),
    CustomMessage('DataDirPrompt'),
    False,
    NewNotebookPage(WizardForm.InnerNotebook, 'DataDir')
  );
  
  // Chemin par défaut : %APPDATA%\com.chequestudio.algerie
  DataDirPage.Add('');
  DataDirPage.Values[0] := ExpandConstant('{userappdata}\com.chequestudio.algerie');
end;

// Sauvegarder l'emplacement de données sélectionné dans un fichier de configuration initial
procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigFile: String;
  ConfigContent: String;
begin
  if CurStep = ssPostInstall then
  begin
    SelectedDataDir := DataDirPage.Values[0];
    if SelectedDataDir = '' then
      SelectedDataDir := ExpandConstant('{userappdata}\com.chequestudio.algerie');

    // Créer le dossier de données s'il n'existe pas
    ForceDirectories(SelectedDataDir);

    // Écrire le pointeur de configuration dans le répertoire de l'application
    ConfigFile := ExpandConstant('{app}\storage-config.json');
    ConfigContent := '{"customDataDir": "' + ReplaceStr(SelectedDataDir, '\', '\\') + '", "installedAt": "' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', '-', ':') + '"}';
    SaveStringToFile(ConfigFile, ConfigContent, False);
  end;
end;
