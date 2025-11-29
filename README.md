# Pine Script Compiler (v4/v5/v6)

<p align="center">
  <img src="assets/logo.svg" alt="Pine Script Compiler logo" width="160"/>
</p>



![CI](https://github.com/CHANGGELY/pine-script-compiler/actions/workflows/ci.yml/badge.svg)


English | [中文](#中文说明)


A local, incremental Pine Script compiler providing syntax and semantic analysis, aiming to power high-quality tooling and CI for TradingView Pine Script (v4/v5/v6).


## Features
- Syntax parsing and AST scaffolding
- Early-stage semantic analyzer
- CLI entry with scripts: `dev`, `build`, `type-check`, `test`, `start`
- CI with Node 18.x/20.x, ESLint annotations, TypeScript check and build


## Quick Start


```bash
# clone
git clone https://github.com/CHANGGELY/pine-script-compiler.git
cd pine-script-compiler


# install
npm install


# develop (runs src/cli.ts with tsx)
npm run dev


# type-check & test
npm run type-check
npm test -- --coverage


# build and run CLI
npm run build
npm run start -- --help
```


## Roadmap
- [ ] Robust lexer and parser
- [ ] Type system and inference
- [ ] Full semantic rules and diagnostics
- [ ] Cross-version support (v4/v5/v6 specifics)
- [ ] Release binaries and docs


## Contributing
- PRs welcome. Please follow ESLint/Prettier rules. CI will annotate problems as warnings.
- Use clear commit messages (English or Chinese). For large changes, include a short design note in PR description.
