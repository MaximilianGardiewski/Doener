# Web-Derivat

Aktuell existiert im Repository kein governter WebP-Konverter. Deshalb wird hier kein WebP, kein Fake-Derivat und keine manuell abweichende Kopie abgelegt.

Bis eine vorhandene Repo-Pipeline WebP reproduzierbar erzeugen kann, verwenden Dev-Server und Preview-Build den kanonischen transparenten PNG-Master. Eine spätere Pipeline darf aus diesem Master ein Derivat erzeugen, muss Hash und Transformationsschritt im Manifest aktualisieren und darf keine Browser-Runtime-Abhängigkeit einführen.
