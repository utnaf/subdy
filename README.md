# Subdy

Un metronomo specializzato per allenare le suddivisioni ritmiche. Batte il tempo normale (i quarti) e, in anticipo, ti dice quale suddivisione suonare nel blocco di battute successivo.

Nessuna build, nessuna dipendenza: solo HTML, CSS e JS vanilla, pensato per girare su GitHub Pages.

## Uso in locale

Serve una qualsiasi web server statico (serve per via del `fetch`/moduli non usati qui, ma è buona norma evitare `file://` per l'AudioContext su alcuni browser):

```bash
python3 -m http.server 8000
```

Poi apri `http://localhost:8000`.

## Come funziona

- Imposta BPM, battiti per battuta e ogni quante battute cambiare suddivisione ("blocco").
- Seleziona quali suddivisioni vuoi che vengano richieste (set base, set esteso, o una selezione personalizzata).
- Premi Start (o barra spaziatrice): il metronomo suona solo i quarti (accento sul primo battito), mentre a schermo vedi la suddivisione "ora" richiesta per il blocco corrente e, con una battuta di anticipo, la "prossima".

## Deploy su GitHub Pages

Repo: https://github.com/utnaf/subdy

1. Push su `main`.
2. Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/(root)`.
3. L'app sarà disponibile su `https://utnaf.github.io/subdy/`.
