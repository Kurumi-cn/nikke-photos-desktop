; Deliberately preserve data/, backups and any unrecognised files in INSTDIR.
; Never use recursive removal of the install directory or AppData.
!include "installed-files.nsh"
!macro customRemoveFiles
  SetOutPath $TEMP
  !insertmacro RemoveOwnedFiles
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  RMDir "$INSTDIR"
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
