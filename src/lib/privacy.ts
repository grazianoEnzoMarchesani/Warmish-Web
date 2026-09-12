/**
 * Privacy notice text, bilingual. Kept in a plain module (not the locale JSON)
 * because it is long-form service copy: hand-written HTML fragments, rendered
 * with `{@html}`, none of it from external input.
 *
 * This text describes real technical behaviour of the app. If what Warmish does
 * changes — another third-party service, another datum, another purpose — change
 * it here in the same session. The gate it documents lives in
 * `src/lib/consent.svelte.ts`.
 */

import type { Locale } from './i18n';

/** Month of the last substantive revision, per language. */
export const PRIVACY_UPDATED: Record<Locale, string> = {
  it: 'settembre 2026',
  en: 'September 2026',
};

export interface PrivacySection {
  id: string;
  title: string;
  /** Pre-formatted HTML fragments (paragraphs, lists, tables). */
  body: string[];
}

const it: PrivacySection[] = [
  {
    id: 'sintesi',
    title: 'In breve',
    body: [
      '<p>Warmish Web elabora le foto termiche <strong>interamente nel tuo browser</strong>. Nessuna immagine, coordinata GPS o dato radiometrico viene mai caricato su un server. Il sito non usa cookie, non raccoglie statistiche, non contiene pubblicità e non profila chi lo visita. Caratteri, librerie e grafica dell’app sono serviti da questo stesso dominio.</p>',
      '<p>Due funzioni si collegano a internet, ed entrambe <strong>restano spente finché non sei tu ad attivarle</strong>: la vista mappa (e lo strumento Geotag), che scarica lo sfondo cartografico da un fornitore esterno, e «Rileva scena» nel pannello Aree, che scarica un modello di riconoscimento (strada, edifici, persone) da Google. Se non dai il consenso a una delle due, quella funzione resta disattivata e tutto il resto dell’app funziona normalmente.</p>',
      '<p>Quanto segue spiega tutto nel dettaglio, come richiesto dagli articoli 13 e 14 del Regolamento (UE) 2016/679 (GDPR).</p>',
    ],
  },
  {
    id: 'titolare',
    title: '1. Titolare del trattamento',
    body: [
      '<p>Il titolare del trattamento è <strong>Graziano Enzo Marchesani</strong>, in qualità di persona fisica.</p>',
      '<ul><li>Email: <strong>graziano.marchesani [at] unicam.it</strong> (sostituisci <code>[at]</code> con <code>@</code>)</li></ul>',
      '<p>Questo è un progetto personale. Sebbene sia uno strumento nato per attività di ricerca e didattica svolte presso l’Università di Camerino, <strong>non è un sito istituzionale e l’Università non è titolare né responsabile dei trattamenti qui descritti</strong>.</p>',
      '<p>Non è stato nominato un Responsabile della protezione dei dati (DPO), non ricorrendone i presupposti di cui all’art. 37 GDPR.</p>',
    ],
  },
  {
    id: 'non-fa',
    title: '2. Cosa questo sito non fa',
    body: [
      '<p>Per chiarezza, e perché è verificabile ispezionando il codice sorgente, che è pubblico:</p>',
      `<ul>
        <li><strong>Non utilizza cookie.</strong> Nessuno, né tecnici né di terze parti.</li>
        <li><strong>Non utilizza sistemi di analisi del traffico</strong> (Google Analytics o equivalenti), né pixel di tracciamento, né beacon, né mappe di calore, né test A/B.</li>
        <li><strong>Non ospita pubblicità</strong> e non aderisce a reti pubblicitarie.</li>
        <li><strong>Non profila</strong> gli utenti e non adotta processi decisionali automatizzati.</li>
        <li><strong>Non rileva la posizione geografica</strong> del dispositivo e non impiega tecniche di identificazione del dispositivo (<em>fingerprinting</em>).</li>
        <li><strong>Non ospita moduli</strong> di contatto, registrazione, commenti o iscrizione a newsletter.</li>
        <li><strong>Caratteri tipografici, librerie e grafica dell’app sono serviti da questo dominio.</strong> Nessuna chiamata a Google Fonts o a una CDN per il funzionamento ordinario dell’app. Fa eccezione, solo se la attivi tu, la funzione «Rileva scena» (§ 4.3), che scarica un modello da Google.</li>
        <li><strong>Le immagini che apri non vengono caricate da nessuna parte.</strong> La decodifica FLIR, il calcolo delle temperature, le palette, le aree di interesse e l’esportazione avvengono tutti sul tuo dispositivo — anche quando usi «Rileva scena»: solo il modello scende dalla rete, mai la tua foto.</li>
      </ul>`,
    ],
  },
  {
    id: 'senza-consenso',
    title: '3. Dati trattati senza necessità di consenso',
    body: [
      '<h3>3.1 Dati di navigazione registrati dal servizio di hosting</h3>',
      '<p>Il sito è ospitato su <strong>GitHub Pages</strong>, servizio fornito da GitHub, Inc. Come ogni server web, l’infrastruttura registra automaticamente, per ogni richiesta ricevuta: indirizzo IP; tipo e versione del browser e del sistema operativo (<em>user agent</em>); indirizzo della pagina richiesta e data e ora; eventuale pagina di provenienza (<em>referer</em>).</p>',
      '<p>Questi dati sono necessari al funzionamento stesso della comunicazione via Internet: senza indirizzo IP nessuna pagina potrebbe esserti recapitata.</p>',
      `<ul>
        <li><strong>Finalità:</strong> consegna dei contenuti, sicurezza dell’infrastruttura, diagnosi di malfunzionamenti e prevenzione degli abusi.</li>
        <li><strong>Base giuridica:</strong> legittimo interesse del titolare a erogare il servizio in modo sicuro e funzionante, art. 6(1)(f) GDPR.</li>
        <li><strong>Destinatario:</strong> GitHub, Inc. (gruppo Microsoft), in qualità di responsabile del trattamento ex art. 28 GDPR.</li>
        <li><strong>Conservazione:</strong> i tempi sono determinati dal fornitore. Il titolare <strong>non ha accesso a questi registri</strong> e non li utilizza per alcuna finalità propria.</li>
        <li><strong>Trasferimento extra-UE:</strong> vedi § 6.</li>
      </ul>`,
      '<h3>3.2 Archiviazione tecnica sul tuo dispositivo</h3>',
      '<p>L’app salva alcune preferenze nella memoria locale del browser (<code>localStorage</code>): la lingua, il tema, il pannello attivo, l’ultima palette e scala usate, lo stato della striscia delle miniature, il fondo mappa scelto e — se esprimi una scelta — il consenso allo sfondo cartografico (voce <code>warmish.mapConsent</code>) e il consenso al modello di rilevamento scena (voce <code>warmish.sceneConsent</code>), entrambi con la relativa data. Lo strumento Geotag salva le posizioni che assegni a mano alle foto.</p>',
      '<p>Nessuno di questi valori contiene dati personali o identificativi, non permette di riconoscerti e non è leggibile da terzi. Puoi cancellarli in qualsiasi momento dalle impostazioni del browser. Entrambi i consensi scadono comunque dopo <strong>sei mesi</strong>, dopodiché tornano allo stato di rifiuto.</p>',
      '<p><strong>Base giuridica:</strong> archiviazione strettamente necessaria alla fornitura del servizio richiesto, esente da consenso ai sensi dell’art. 122, comma 1, del Codice Privacy (D.Lgs. 196/2003) e dell’art. 5(3) della Direttiva 2002/58/CE.</p>',
      '<h3>3.3 Le immagini che elabori</h3>',
      '<p>Le foto radiometriche FLIR possono contenere dati personali: coordinate GPS, data e ora dello scatto, numero di serie della fotocamera e, a volte, il nome dell’operatore. Warmish li legge, li mostra e li usa (per esempio per posizionare gli scatti sulla mappa) <strong>senza mai trasmetterli</strong>. Restano nel tuo browser per tutta la durata della sessione e vengono scartati quando chiudi la scheda.</p>',
      '<p>I file che <strong>esporti</strong> (ZIP, sessioni <code>.json</code>, foto ri-geotaggate) contengono questi metadati e il nome del file originale. Sei tu a decidere se e con chi condividerli, e — se le immagini ritraggono edifici o persone di terzi — sei tu il titolare del relativo trattamento. Lo strumento Geotag, in particolare, <strong>scrive le coordinate GPS nell’EXIF</strong> delle copie che produce.</p>',
    ],
  },
  {
    id: 'con-consenso',
    title: '4. Dati trattati solo con il tuo consenso',
    body: [
      '<h3>Stato predefinito: disattivato</h3>',
      '<p>La vista mappa e lo strumento Geotag mostrano le foto su una mappa scorrevole. Per disegnare la mappa il browser deve scaricare le <em>mattonelle</em> (tile) della cartografia da un fornitore esterno. Finché non compi un’azione esplicita di accettazione <strong>nessuna richiesta raggiunge questi fornitori</strong> e la mappa non viene caricata.</p>',
      '<p>Chiudere il pannello, scegliere «Non ora» o non rispondere producono lo stesso effetto tecnico del rifiuto. Nessun comportamento passivo vale come consenso (art. 4(11) e considerando 32 GDPR).</p>',
      '<h3>4.1 Fornitori delle mappe</h3>',
      `<ul>
        <li><strong>OpenFreeMap</strong> — sfondo minimale predefinito (progetto no-profit). Include una richiesta iniziale al file di configurazione delle mattonelle.</li>
        <li><strong>Esri</strong> (Environmental Systems Research Institute, Inc., USA) — vista satellitare.</li>
        <li><strong>OpenStreetMap Foundation</strong> (Regno Unito) — vista stradale.</li>
      </ul>`,
      '<p>Quando la mappa è attiva, il fornitore delle mattonelle mostrate riceve: il tuo <strong>indirizzo IP</strong>, informazioni su browser e dispositivo (<em>user agent</em>), e le coordinate dei riquadri di mappa richiesti, cioè <strong>l’area geografica che stai visualizzando</strong>. Nessuna immagine, coordinata delle tue foto o dato termico viene inviato: viene rivelata solo la porzione di mappa a schermo.</p>',
      '<p>Da quel momento il trattamento dei dati di navigazione è effettuato da ciascun fornitore in qualità di titolare autonomo, secondo le proprie condizioni: <a href="https://www.esri.com/en-us/privacy/overview" target="_blank" rel="noopener noreferrer">Esri</a>, <a href="https://wiki.osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener noreferrer">OpenStreetMap Foundation</a>, <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>.</p>',
      `<ul>
        <li><strong>Base giuridica:</strong> consenso, art. 6(1)(a) GDPR e art. 122 Codice Privacy per l’eventuale archiviazione sul dispositivo effettuata dal fornitore.</li>
        <li><strong>Se non presti il consenso:</strong> la vista mappa e il Geotag restano disponibili ma senza sfondo cartografico; tutte le altre funzioni di Warmish (palette, calibrazione, aree, esportazione) funzionano identiche.</li>
      </ul>`,
      '<h3>4.2 Revoca del consenso</h3>',
      '<p>Puoi <strong>modificare o revocare la scelta in qualsiasi momento</strong> dal riquadro «Preferenze» in cima a questa pagina, oppure cancellando i dati del sito dal tuo browser. La revoca impedisce ulteriori richieste ai fornitori delle mappe da questa sessione in poi, ma non incide sui trattamenti già effettuati da tali soggetti, verso i quali i diritti vanno esercitati direttamente.</p>',
      '<h3>4.3 Il modello di rilevamento scena</h3>',
      '<p>Il pulsante «Rileva scena (strada, edifici, persone)» nel pannello Aree esegue, sulla foto reale abbinata allo scatto termico, un modello di comprensione della scena (segmentazione semantica Cityscapes) <strong>interamente nel tuo browser</strong>. La prima volta che lo usi, il browser scarica i pesi del modello (alcuni megabyte) da <strong>Google</strong>, tramite il suo model hub (tfhub.dev); le volte successive il browser li recupera dalla propria cache, senza nuove richieste. Finché non accetti esplicitamente, la funzione resta disattivata e nessuna richiesta raggiunge Google.</p>',
      '<p>Questa richiesta rivela a Google il tuo <strong>indirizzo IP</strong> e informazioni su browser e dispositivo (<em>user agent</em>): sono i dati minimi necessari per scaricare un file. <strong>La foto che stai analizzando non viene mai inviata</strong>: il modello gira localmente sul tuo dispositivo, e il suo risultato (i punti su strada, edifici e persone) resta nel tuo browser come qualunque altra area che disegni a mano.</p>',
      `<ul>
        <li><strong>Base giuridica:</strong> consenso, art. 6(1)(a) GDPR.</li>
        <li><strong>Se non presti il consenso:</strong> il pulsante resta disponibile ma, al primo utilizzo, richiede una conferma; se rifiuti, «Rileva scena» non funziona ma tutte le altre funzioni di Warmish restano identiche.</li>
      </ul>`,
    ],
  },
  {
    id: 'link-esterni',
    title: '5. Collegamenti verso siti esterni',
    body: [
      '<p>Il sito contiene alcuni collegamenti a risorse esterne (repository del codice, siti dei fornitori delle mappe, questa stessa informativa presso terzi). Seguendoli lasci questo sito: il titolare non esercita alcun controllo sui siti di destinazione e non risponde dei loro contenuti né dei trattamenti da essi effettuati.</p>',
    ],
  },
  {
    id: 'trasferimenti',
    title: '6. Trasferimenti verso Paesi terzi',
    body: [
      '<p>Alcuni dei soggetti indicati hanno sede o infrastrutture al di fuori dello Spazio Economico Europeo, in particolare negli Stati Uniti d’America.</p>',
      `<div class="privacy-table"><table>
        <thead><tr><th>Soggetto</th><th>Trattamento</th><th>Garanzia per il trasferimento</th></tr></thead>
        <tbody>
          <tr><td>GitHub, Inc. (Microsoft)</td><td>hosting e registri di accesso</td><td>Decisione di adeguatezza <em>EU–US Data Privacy Framework</em>; clausole contrattuali tipo</td></tr>
          <tr><td>Esri (USA)</td><td>mattonelle della vista satellitare, <strong>solo previo consenso</strong></td><td>Clausole contrattuali tipo; ove applicabile <em>EU–US Data Privacy Framework</em></td></tr>
          <tr><td>OpenStreetMap Foundation (UK)</td><td>mattonelle della vista stradale, <strong>solo previo consenso</strong></td><td>Regno Unito: decisione di adeguatezza della Commissione UE</td></tr>
          <tr><td>OpenFreeMap</td><td>sfondo minimale, <strong>solo previo consenso</strong></td><td>Infrastruttura nello Spazio Economico Europeo</td></tr>
          <tr><td>Google LLC (USA)</td><td>download del modello di rilevamento scena, <strong>solo previo consenso</strong></td><td>Decisione di adeguatezza <em>EU–US Data Privacy Framework</em>; clausole contrattuali tipo</td></tr>
        </tbody>
      </table></div>`,
      '<p>I trasferimenti avvengono ai sensi degli articoli 44 e seguenti del GDPR. Puoi ottenere maggiori informazioni sulle garanzie adottate scrivendo all’indirizzo indicato al § 1.</p>',
    ],
  },
  {
    id: 'conservazione',
    title: '7. Periodi di conservazione',
    body: [
      `<ul>
        <li><strong>Registri di accesso dell’hosting:</strong> secondo le politiche del fornitore; non accessibili al titolare.</li>
        <li><strong>Preferenze dell’app e posizioni del Geotag:</strong> nella memoria del tuo browser, finché non le cancelli.</li>
        <li><strong>Consenso allo sfondo cartografico e al modello di rilevamento scena:</strong> fino a 6 mesi ciascuno, o fino a quando non li modifichi.</li>
        <li><strong>Immagini elaborate e relativi metadati:</strong> in memoria per la sola durata della sessione; nulla viene conservato dopo la chiusura della scheda.</li>
      </ul>`,
    ],
  },
  {
    id: 'diritti',
    title: '8. I tuoi diritti',
    body: [
      '<p>In relazione ai dati che ti riguardano puoi esercitare, ai sensi degli articoli 15-22 del GDPR, i diritti di accesso, rettifica, cancellazione, limitazione, portabilità, opposizione ai trattamenti fondati sul legittimo interesse e revoca del consenso.</p>',
      '<p>Le richieste vanno inviate all’indirizzo indicato al § 1 e ricevono riscontro entro un mese, prorogabile nei casi previsti dall’art. 12(3) GDPR.</p>',
      '<p>Se ritieni che il trattamento violi la normativa, hai diritto di proporre <strong>reclamo al Garante per la protezione dei dati personali</strong> (Piazza Venezia 11, 00187 Roma — <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">garanteprivacy.it</a>) o all’autorità di controllo dello Stato in cui risiedi, oppure di ricorrere all’autorità giudiziaria.</p>',
    ],
  },
  {
    id: 'automatizzate',
    title: '9. Processi decisionali automatizzati',
    body: [
      '<p>Il titolare non effettua profilazione né adotta decisioni basate unicamente su trattamenti automatizzati ai sensi dell’art. 22 GDPR.</p>',
    ],
  },
  {
    id: 'minori',
    title: '10. Minori',
    body: [
      '<p>Il sito non è rivolto a minori di anni quattordici e non raccoglie consapevolmente i loro dati.</p>',
    ],
  },
  {
    id: 'modifiche',
    title: '11. Modifiche',
    body: [
      '<p>La presente informativa può essere aggiornata per adeguarla a modifiche del sito o della normativa. La data in cima indica l’ultima revisione. Le modifiche sostanziali che incidono sui consensi già raccolti comportano una nuova richiesta di consenso.</p>',
    ],
  },
];

const en: PrivacySection[] = [
  {
    id: 'sintesi',
    title: 'In short',
    body: [
      '<p>Warmish Web processes thermal photos <strong>entirely in your browser</strong>. No image, GPS coordinate or radiometric data is ever uploaded to a server. The site sets no cookies, collects no analytics, carries no advertising and does not profile its visitors. The app\'s fonts, libraries and graphics are served from this domain.</p>',
      '<p>Two features reach the network, and <strong>both stay off until you switch them on</strong>: the map view (and the Geotag tool), which downloads the base cartography from an external provider, and "Detect scene" in the Areas panel, which downloads a recognition model (road, buildings, people) from Google. If you decline either one, that feature stays off and the rest of the app works normally.</p>',
      '<p>What follows sets out the detail required by Articles 13 and 14 of Regulation (EU) 2016/679 (GDPR).</p>',
    ],
  },
  {
    id: 'titolare',
    title: '1. Data controller',
    body: [
      '<p>The data controller is <strong>Graziano Enzo Marchesani</strong>, acting as a natural person.</p>',
      '<ul><li>Email: <strong>graziano.marchesani [at] unicam.it</strong> (replace <code>[at]</code> with <code>@</code>)</li></ul>',
      '<p>This is a personal project. Although it is a tool built for research and teaching carried out at the University of Camerino, <strong>it is not an institutional site, and the University neither operates it nor determines the purposes of the processing described here</strong>.</p>',
      '<p>No Data Protection Officer has been appointed, the conditions of Article 37 GDPR not being met.</p>',
    ],
  },
  {
    id: 'non-fa',
    title: '2. What this site does not do',
    body: [
      '<p>Stated plainly, and verifiable by inspecting the source code, which is public:</p>',
      `<ul>
        <li><strong>No cookies.</strong> None at all, neither technical nor third-party.</li>
        <li><strong>No analytics</strong> (Google Analytics or equivalent), no tracking pixels, no beacons, no heatmaps, no A/B testing.</li>
        <li><strong>No advertising</strong> and no membership of any ad network.</li>
        <li><strong>No profiling</strong> and no automated decision-making.</li>
        <li><strong>No device geolocation</strong> and no device fingerprinting.</li>
        <li><strong>No forms</strong> for contact, registration, comments or newsletters.</li>
        <li><strong>The app's fonts, libraries and graphics are served from this domain.</strong> No call to Google Fonts or to a CDN for the app's ordinary operation. The one exception, only if you switch it on yourself, is "Detect scene" (§ 4.3), which downloads a model from Google.</li>
        <li><strong>The images you open are not uploaded anywhere.</strong> FLIR decoding, temperature computation, palettes, regions of interest and export all happen on your device — including when you use "Detect scene": only the model comes down from the network, never your photo.</li>
      </ul>`,
    ],
  },
  {
    id: 'senza-consenso',
    title: '3. Processing that does not require consent',
    body: [
      '<h3>3.1 Access logs kept by the hosting provider</h3>',
      '<p>The site is hosted on <strong>GitHub Pages</strong>, provided by GitHub, Inc. Like any web server, the infrastructure automatically records, for each request: IP address; browser and operating system (user agent); the address of the page requested, the date and time; and any referring page.</p>',
      '<p>These data are inherent to communication over the Internet: without an IP address no page could be delivered to you.</p>',
      `<ul>
        <li><strong>Purposes:</strong> delivering content, infrastructure security, fault diagnosis and abuse prevention.</li>
        <li><strong>Legal basis:</strong> the controller’s legitimate interest in operating the service securely, Article 6(1)(f) GDPR.</li>
        <li><strong>Recipient:</strong> GitHub, Inc. (Microsoft group), as processor under Article 28 GDPR.</li>
        <li><strong>Retention:</strong> determined by the provider. The controller <strong>has no access to these logs</strong> and puts them to no purpose of their own.</li>
        <li><strong>Transfer outside the EU:</strong> see § 6.</li>
      </ul>`,
      '<h3>3.2 Technical storage on your device</h3>',
      '<p>The app saves a few preferences in the browser’s local storage (<code>localStorage</code>): language, theme, active panel, the last palette and scale used, the filmstrip state, the chosen basemap and — if you make a choice — your map-tile consent (under <code>warmish.mapConsent</code>) and your scene-detection-model consent (under <code>warmish.sceneConsent</code>), each with its date. The Geotag tool saves the positions you assign to photos by hand.</p>',
      '<p>None of these values holds personal or identifying data, none can be used to recognise you, and none is readable by third parties. You can delete them at any time from your browser settings. Both consents lapse after <strong>six months</strong> in any case, reverting to declined.</p>',
      '<p><strong>Legal basis:</strong> storage strictly necessary to provide the service you requested, exempt from consent under Article 5(3) of Directive 2002/58/EC.</p>',
      '<h3>3.3 The images you process</h3>',
      '<p>Radiometric FLIR photos can contain personal data: GPS coordinates, capture date and time, camera serial number and sometimes the operator’s name. Warmish reads, shows and uses them (for example to place shots on the map) <strong>without ever transmitting them</strong>. They stay in your browser for the session and are discarded when you close the tab.</p>',
      '<p>The files you <strong>export</strong> (ZIPs, <code>.json</code> sessions, re-geotagged photos) carry this metadata and the original file name. It is for you to decide whether and with whom to share them, and — where the images show third parties’ buildings or people — you are the controller of that processing. The Geotag tool in particular <strong>writes GPS coordinates into the EXIF</strong> of the copies it produces.</p>',
    ],
  },
  {
    id: 'con-consenso',
    title: '4. Processing that requires your consent',
    body: [
      '<h3>Default state: off</h3>',
      '<p>The map view and the Geotag tool show photos on a slippy map. To draw the map, the browser must download cartography <em>tiles</em> from an external provider. Until you take an explicit step to accept, <strong>no request reaches these providers</strong> and the map is not loaded.</p>',
      '<p>Closing the panel, choosing “Not now” or not answering all produce the same technical result as declining. No passive behaviour counts as consent (Article 4(11) and Recital 32 GDPR).</p>',
      '<h3>4.1 Map providers</h3>',
      `<ul>
        <li><strong>OpenFreeMap</strong> — the default minimal basemap (a non-profit project). Includes an initial request for the tile configuration file.</li>
        <li><strong>Esri</strong> (Environmental Systems Research Institute, Inc., USA) — satellite view.</li>
        <li><strong>OpenStreetMap Foundation</strong> (United Kingdom) — street view.</li>
      </ul>`,
      '<p>When the map is active, the provider of the tiles shown receives: your <strong>IP address</strong>, browser and device information (user agent), and the coordinates of the map tiles requested — that is, <strong>the geographic area you are viewing</strong>. No image, no coordinate from your photos and no thermal data is sent: only the on-screen slice of map is revealed.</p>',
      '<p>From that point the processing of navigation data is carried out by each provider as an independent controller, on its own terms: <a href="https://www.esri.com/en-us/privacy/overview" target="_blank" rel="noopener noreferrer">Esri</a>, <a href="https://wiki.osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener noreferrer">OpenStreetMap Foundation</a>, <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>.</p>',
      `<ul>
        <li><strong>Legal basis:</strong> consent, Article 6(1)(a) GDPR, and Article 122 of the Italian Privacy Code for any storage the provider places on your device.</li>
        <li><strong>If you do not consent:</strong> the map view and Geotag stay available but without base cartography; every other Warmish feature (palette, calibration, areas, export) works exactly the same.</li>
      </ul>`,
      '<h3>4.2 Withdrawing consent</h3>',
      '<p>You may <strong>change or withdraw your choice at any time</strong> from the “Preferences” box at the top of this page, or by clearing the site data in your browser. Withdrawal stops any further requests to the map providers from that point on, but does not undo processing already performed by those parties, against which rights must be exercised directly.</p>',
      '<h3>4.3 The scene-detection model</h3>',
      '<p>The "Detect scene (road, buildings, people)" button in the Areas panel runs a scene-understanding model (Cityscapes semantic segmentation) on the real photo paired with the thermal shot, <strong>entirely in your browser</strong>. The first time you use it, the browser downloads the model\'s weights (a few megabytes) from <strong>Google</strong>, via its model hub (tfhub.dev); on later uses the browser serves them from its own cache, with no new request. Until you explicitly accept, the feature stays off and no request reaches Google.</p>',
      '<p>That download reveals your <strong>IP address</strong> and browser/device information (user agent) to Google — the minimum needed to fetch a file. <strong>The photo you are analysing is never sent</strong>: the model runs locally on your device, and its result (the points on the road, buildings and people) stays in your browser like any area you draw by hand.</p>',
      `<ul>
        <li><strong>Legal basis:</strong> consent, Article 6(1)(a) GDPR.</li>
        <li><strong>If you do not consent:</strong> the button stays available but asks for confirmation on first use; if you decline, "Detect scene" doesn't run, while every other Warmish feature stays exactly the same.</li>
      </ul>`,
    ],
  },
  {
    id: 'link-esterni',
    title: '5. Links to external sites',
    body: [
      '<p>The site links to a few external resources (the code repository, the map providers’ sites, this notice hosted elsewhere). Following them takes you away from this site: the controller exercises no control over the destination sites and is not answerable for their content or their processing.</p>',
    ],
  },
  {
    id: 'trasferimenti',
    title: '6. Transfers to third countries',
    body: [
      '<p>Some of the parties named above are established, or operate infrastructure, outside the European Economic Area, in particular in the United States of America.</p>',
      `<div class="privacy-table"><table>
        <thead><tr><th>Party</th><th>Processing</th><th>Transfer safeguard</th></tr></thead>
        <tbody>
          <tr><td>GitHub, Inc. (Microsoft)</td><td>hosting and access logs</td><td><em>EU–US Data Privacy Framework</em> adequacy decision; standard contractual clauses</td></tr>
          <tr><td>Esri (USA)</td><td>satellite-view tiles, <strong>consent only</strong></td><td>Standard contractual clauses; where applicable the <em>EU–US Data Privacy Framework</em></td></tr>
          <tr><td>OpenStreetMap Foundation (UK)</td><td>street-view tiles, <strong>consent only</strong></td><td>United Kingdom: European Commission adequacy decision</td></tr>
          <tr><td>OpenFreeMap</td><td>minimal basemap, <strong>consent only</strong></td><td>Infrastructure within the European Economic Area</td></tr>
          <tr><td>Google LLC (USA)</td><td>scene-detection model download, <strong>consent only</strong></td><td><em>EU–US Data Privacy Framework</em> adequacy decision; standard contractual clauses</td></tr>
        </tbody>
      </table></div>`,
      '<p>Transfers take place under Articles 44 et seq. GDPR. Further information about the safeguards in place is available on request at the address in § 1.</p>',
    ],
  },
  {
    id: 'conservazione',
    title: '7. Retention periods',
    body: [
      `<ul>
        <li><strong>Hosting access logs:</strong> per the provider’s policy; not accessible to the controller.</li>
        <li><strong>App preferences and Geotag positions:</strong> in your browser’s storage, until you clear them.</li>
        <li><strong>Map-tile and scene-detection-model consent:</strong> up to 6 months each, or until you change them.</li>
        <li><strong>Processed images and their metadata:</strong> in memory for the session only; nothing is kept after the tab closes.</li>
      </ul>`,
    ],
  },
  {
    id: 'diritti',
    title: '8. Your rights',
    body: [
      '<p>In relation to data concerning you, you may exercise the rights set out in Articles 15 to 22 GDPR: access, rectification, erasure, restriction, portability, objection to processing based on legitimate interest, and withdrawal of consent.</p>',
      '<p>Requests should be sent to the address in § 1 and are answered within one month, extendable in the cases allowed by Article 12(3) GDPR.</p>',
      '<p>If you consider that the processing infringes the law, you have the right to lodge a complaint with the Italian data protection authority, the <strong>Garante per la protezione dei dati personali</strong> (Piazza Venezia 11, 00187 Rome — <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">garanteprivacy.it</a>), or with the supervisory authority of the country where you live, or to bring proceedings before a court.</p>',
    ],
  },
  {
    id: 'automatizzate',
    title: '9. Automated decision-making',
    body: [
      '<p>The controller carries out no profiling and takes no decisions based solely on automated processing within the meaning of Article 22 GDPR.</p>',
    ],
  },
  {
    id: 'minori',
    title: '10. Children',
    body: [
      '<p>The site is not directed at children under fourteen and does not knowingly collect their data.</p>',
    ],
  },
  {
    id: 'modifiche',
    title: '11. Changes to this notice',
    body: [
      '<p>This notice may be updated to reflect changes to the site or to the law. The date at the top indicates the latest revision. Substantial changes affecting consent already given will prompt a fresh request for consent.</p>',
    ],
  },
];

export const privacySections = (locale: Locale): PrivacySection[] => (locale === 'en' ? en : it);
