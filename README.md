# Budgetapp / Sparkompas

En Next.js-app til at fordele en bankopsparing mellem faste poster og
opsparingsmål. Appen beregner månedligt behov, faktisk afsat beløb, manko og
overskud.

## Lokal udvikling

Installer afhængigheder og start udviklingsserveren:

```bash
npm install
npm run dev
```

Åbn derefter [http://localhost:3000](http://localhost:3000).

## Beregningsprincipper

Den centrale beregningslogik ligger i
[`src/lib/savings.ts`](./src/lib/savings.ts), mens visningen ligger i
[`src/app/page.tsx`](./src/app/page.tsx).

### Mål og startmåned

- Et mål får automatisk `createdAt`, når det oprettes.
- `createdAt` er målets startpunkt og skal ikke overskrives af en fælles eller
  manuel startdato.
- Startmåneden tæller med. Et mål oprettet i september får derfor sin første
  planlagte månedsandel i september.
- Nye mål starter altid i den måned, hvor de bliver oprettet.
- Målets oprindelige periode går fra oprettelsesmåneden til måldatoen. Det
  månedlige behov ændrer sig ikke, blot fordi måldatoen nærmer sig.

Eksempel: Et mål på 5.000 kr. med fem planlagte måneder har et fast månedligt
behov på 1.000 kr. Hvis det oprettes i september, tæller september som måned
1, oktober som måned 2 osv.

### Fordeling

- Bankopsparingen reduceres først med faste poster.
- Den resterende saldo fordeles efter målenes månedlige behov.
- Fordelingen kan ikke afsætte penge til fremtidige måneder for tidligt.
- Et mål kan højst få det beløb, der er nået ifølge den oprindelige plan, eller
  det resterende beløb op til selve målbeløbet.
- Når et mål er fuldt opfyldt, fordeles resterende beløb videre til andre mål,
  der stadig har kapacitet i deres aktuelle plan.
- Beløb, der ikke skal afsættes til mål endnu, bliver stående som overskud.

### Manko og status

- `Afsat til mål` er det beløb, der faktisk er fordelt til målene.
- `Overskud` er beløbet efter faste poster og målfordeling.
- `Afsat til mål + Overskud = Bankopsparing - faste poster`.
- Manko sammenligner faktisk afsat beløb med den kumulative opsparing, der
  burde være nået fra målets startpunkt.
- Et mål vises som **på sporet**, når den kumulative plan er dækket.
- Et mål vises som **bagud**, når den kumulative plan ikke er dækket.
- Et mål vises som **opfyldt**, når hele målbeløbet er nået.

### Lagring og deling

- Appens data gemmes lokalt i browserens `localStorage`.
- Data følger derfor ikke automatisk med til en anden telefon eller browser.
- Funktionen **Del sync-link** koder den aktuelle app-tilstand i en URL, som
  kan åbnes på en anden enhed.
- Der bruges ikke en database eller server-side persistence i den nuværende
  version.

## Test og build

Kør de automatiserede tests:

```bash
node --experimental-strip-types --test tests/shareState.test.ts tests/parseBankBalanceInput.test.ts
```

Kør production-build:

```bash
npm run build
```

Testene dækker blandt andet:

- parsing af bankbeløb
- delingslinks
- fast månedligt behov fra startpunktet
- inklusiv startmåned
- manko over tid
- ingen for tidlig finansiering ved høj banksaldo
- omfordeling efter fuldt opfyldte mål

## GitHub og Vercel

Projektet ligger på GitHub:

<https://github.com/abenherik/budgetapp>

Repositoryets `master`-branch er koblet til Vercel-projektet
`budgetapp`. Når en commit pushes til `master`, sker følgende:

1. GitHub modtager committen.
2. Vercel-integrationen registrerer push'et.
3. Vercel installerer afhængigheder og kører Next.js-builden.
4. Ved succes deployes den nye version til production.
5. GitHub-committen får en Vercel-status som `pending`, `success` eller
   `failure`.

### Normal deploy-proces

Kontrollér først lokalt:

```bash
npm run build
node --experimental-strip-types --test tests/shareState.test.ts tests/parseBankBalanceInput.test.ts
```

Commit og push derefter:

```bash
git add .
git commit -m "Beskriv ændringen"
git push origin master
```

Deployment-status kan ses:

- på committen i GitHub under checks/status
- i Vercel-dashboardet under projektet `budgetapp`

### Vercel CLI

Vercel-projektet er lokalt linket via `.vercel/project.json`. Mappen
`.vercel` er med vilje ignoreret af Git og skal ikke committes.

Manuel production-deploy med CLI:

```bash
npm install
npx vercel login
npx vercel --prod
```

Hvis CLI'en melder, at tokenet er ugyldigt, skal der køres `npx vercel login`
igen. GitHub-integrationen kan stadig deploye automatisk, selv om den lokale
CLI-session ikke er logget ind.

### Miljøvariabler og sikkerhed

- `.env*` er ignoreret af Git og må ikke committes.
- Hemmelige nøgler skal oprettes i Vercels Project Settings under
  Environment Variables.
- Den nuværende app kræver ingen server-side miljøvariabler.

## Relevante filer

- [`src/app/page.tsx`](./src/app/page.tsx) — UI, formularer og summary-tiles
- [`src/lib/savings.ts`](./src/lib/savings.ts) — beregning, fordeling og
  delingslinks
- [`tests/shareState.test.ts`](./tests/shareState.test.ts) — scenarier for
  mål, startmåned og fordeling
- [`tests/parseBankBalanceInput.test.ts`](./tests/parseBankBalanceInput.test.ts)
  — validering af bankbeløb
- [`.gitignore`](./.gitignore) — ignorerede lokale og genererede filer
