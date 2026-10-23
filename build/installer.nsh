; ==============================================================================
; Islet - Custom Windows Installer NSIS Customization Script
; ==============================================================================

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to the Islet Setup Wizard"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Islet on your computer.$\r$\n$\r$\nClose any other applications before continuing with the installation.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Islet has been installed successfully."
  !define MUI_FINISHPAGE_TEXT "Islet is ready to use. Click Finish to exit the setup wizard."
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !insertmacro MUI_PAGE_FINISH
!macroend
