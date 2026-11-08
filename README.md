# DeepSocial

I want build X (twitter) clone

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://deepsocialbeta.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/79625c7c-ab21-4877-89b9-07d4468bdee6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Neon + Vercel deployment

The application now uses Neon PostgreSQL and self-managed Better Auth; Supabase is still used for legacy media storage. See [Neon/Vercel setup](docs/NEON_VERCEL_SETUP.md) before configuring a Preview or Production deployment. Never commit connection strings or service-role keys.
