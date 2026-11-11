@echo off
rem Double-cliquer pour jouer a Muraille : lance le serveur local de l'atelier (si besoin) et ouvre le jeu.
rem Le serveur tourne dans une fenetre reduite "Atelier - serveur" : la fermer arrete le serveur.
cd /d "%~dp0..\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez.
  echo En attendant, vous pouvez ouvrir directement le fichier index.html du jeu.
  pause
  exit /b 1
)

rem Si un serveur de l'atelier tourne deja, serveur.js le detecte et se ferme tout seul.
start "Atelier - serveur" /min node serveur.js muraille
timeout /t 1 /nobreak >nul
start "" "http://localhost:8080/muraille/"
