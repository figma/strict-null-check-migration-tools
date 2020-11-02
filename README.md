This repository contains scripts that Figma used to migrate its TypeScript codebase to use `--strictNullChecks`.

These scripts were originally forked from https://github.com/mjbvz/vscode-strict-null-check-migration-tools

# How to use

These are scripts used in the incremental migration approach described in [LINK TO BLOG POST].

`npm run find-candidates -- <your_project_path>/tsconfig.strictNullChecks.json` lists all the files whose dependencies have all been whitelisted. These files can be safely whitelisted too (once their strict null check errors have been fixed). It generates an output like this:

```
These files only depend on other files for which strictNullCheck has already been enabled.
The dependency count is approximate (this script only resolves up to third order imports).
- [ ] `"./figma_app/views/controls/scrubbable_control.tsx"` — Depended on by >**55** files (2 direct imports)
- [ ] `"./figma_app/plugin/jsvm_node_properties.ts"` — Depended on by >**52** files (3 direct imports)
- [ ] `"./figma_app/views/payments/banners/banners.tsx"` — Depended on by >**28** files (6 direct imports)
- [ ] `"./figma_app/views/file_browser/file_action_dropdown.tsx"` — Depended on by >**14** files (8 direct imports)
...
```

`npm run auto-add -- <your_project_path>/tsconfig.strictNullChecks.json` tries to automatically add to `tsconfig.strictNullChecks.json` every file that can already compile with strictNullChecks without further modifications. It generates an output like this:

```
...
Trying to auto add 'figma_app/views/cart/address_elements.tsx' (file 25/48)
💥 - 25
Trying to auto add 'figma_app/views/cart/cart_celebration.tsx' (file 26/48)
💥 - 7
Trying to auto add 'figma_app/views/cart/number_of_editors.tsx' (file 27/48)
💥 - 7
...
```

`npm run find-cycles -- <your_project_path>/tsconfig.json` finds all dependency cycles that need to be strict null checked together. Generates an output like this:

```
...
Found strongly connected component of size 3
    figma_app/lib/stripe.ts
    figma_app/models/payment.ts
    lib/initial_options.ts
Found strongly connected component of size 3
    figma_app/models/community_hub.ts
    figma_app/models/hub_file.ts
    figma_app/models/plugins.ts
Found 24 strongly connected components
Files not part of a strongly connected components (1974)
    admin_app/admin_app_entry.tsx
    admin_app/admin_middleware.ts
...
```

`npm run visualize` generates visualization data for strict null check progress in `data.js`. In order to view that data, open `progress.html`, a self-contained HTML file. You can also run a more expensive version of this script `npm run visualize -- --countErrors` that tells you how many errors are needed to fix each eligible file, though it takes a long time to run because it needs to compile the codebase multiple times.

# Contributions

Contributions to this repository are not accepted. Since Figma has already completed their migration, our codebase is no longer in a state where we can test these scripts, so we're unable to review patches for correctness. We except that every codebase will have its unique quirks that will require adapting the scripts anyway, even if it's just changing some file path resolution code. You're better off just forking this repo.