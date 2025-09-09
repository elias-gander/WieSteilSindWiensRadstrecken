# Wie steil sind Wiens Radstrecken?

Visualisierung der Straßenneigungen im Wiener Hauptradverkehrsnetz.

Datenbasis ist das Geländemodell der MA 41.

Weitere Infos im [Blogeintrag](https://elias-gander.github.io/2025-9-8-wie-steil-sind-wiens-radstrecken).

[Demo](https://elias-gander.github.io/data-visualization/wie-steil-sind-wiens-radstrecken/)

![screenshot](web/screenshot.png)

## Setup

1. Repo clonen

2. Virtuelles Python-environment erstellen und aktivieren

   1. Im Terminal zum Root-Folders des Repos navigieren
   2. `python -m venv ./venv`
   3. `source venv/bin/activate`

3. Benötigte Python Packages installieren: `pip install -r requirements.txt`

4. FMZK- und Höhenlinien Datenset herunterladen und im _datasets_ ablegen (siehe erste Zelle in _notebook.ipynb_)

5. Alle Zellen des Jupyter-Notebooks (_notebook.ipynb_) ausführen

6. Interaktive Kartendarstellung starten

   1. Im Terminal in den _web_-Folder navigieren
   2. `python -m http.server`
   3. Im Browser zu _http://localhost:8000_ navigieren
