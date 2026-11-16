# L2Price — Controle de preços do mercado (Lineage 2 C1 · L2 Reborn Legacy)

Site estático (GitHub Pages) com dados e login no Supabase.

## Publicação (uma vez só)

### 1. Supabase: criar as tabelas
1. Abra o projeto **L2Price** em https://supabase.com/dashboard.
2. Vá em **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.

### 2. Supabase: pegar a URL e a chave pública
Vá em **Project Settings → API** (ou **API Keys**) e copie:
- a **Project URL** (`https://xxxx.supabase.co`);
- a chave **anon / publishable**. **Nunca** use a `service_role` / `secret`.

Cole as duas em [`public/config.js`](public/config.js).

### 3. GitHub: publicar
1. Crie um repositório chamado `L2Price` e envie esta pasta para a branch `main`.
2. No repositório, vá em **Settings → Pages → Source: GitHub Actions**.
3. A cada push, o workflow `.github/workflows/pages.yml` publica a pasta `public/` em
   `https://SEU-USUARIO.github.io/L2Price/`.

### 4. Supabase: liberar o endereço do site
Em **Authentication → URL Configuration**:
- **Site URL:** `https://SEU-USUARIO.github.io/L2Price/`
- **Redirect URLs:** adicione o mesmo endereço e `http://localhost:3777/`

### 5. Criar sua conta e fechar cadastros
1. Abra o site, clique em **Primeiro acesso? Criar conta** e confirme pelo e-mail que você receber.
2. Depois, para ninguém mais se cadastrar, vá em **Authentication → Sign In / Providers** e desligue **Allow new users to sign up**.

## Testar localmente
`npm start` → http://localhost:3777 (usa o mesmo Supabase).

## Atualizar catálogo/ícones do C1
`npm run update-db` (fonte: [l2hub.info](https://l2hub.info/c1/items)).
