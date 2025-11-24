# Contify

## Inspiration

We both have a lot of experience dealing with PRs and they are often a big headache. We wanted to create a visual interface that allows us to see not only the changes in the PR but also files related to those changes. Having seen HackWestern's website this year, as well as many other infinite canvas visualization tools, we thought this would be a great use case.

## What it does

Contify is a CLI tool that pulls a GitHub PR, parses the patches to find the precise spans of changed code, and visualizes them in an interactive canvas UI. It can also find code across the project that references the changes in the PR, to easily see the scope of the changes made. Contify supports easy authentication with github oauth, allowing for commenting and merging within the application.

Some other neat features include:

- option to automatically checkout the chosen pr
- syntax highlighting
- word diff highlighting
- showing and linking to pr and repo related information

## Setup

```bash
# 1. Build the frontend bundle
cd frontend
npm install
npm run build

# 2. Build the CLI with the embedded frontend
cd ../cli
go mod tidy
make build

# 3. Install the CLI binary (may require sudo)
sudo mv prr /usr/local/bin/prr

# 4. Run Contify from any git repo with an open GitHub PR
cd /path/to/your/repo
prr 123   # replace 123 with your PR number

```

## How we built it

We used Go to create our CLI interface and backend, and React for the front end. To find relationships not included in the diff changes, we detect the filetype and use treesitter to parse and extract relevant information of the node like its type, position and name at the diffed position then traverse up the tree to find a relevant symbol node like function, interfaces, etc. Then make requests to the respective LSP (language server protocol) with the extracted information to find references across the repo.

## Challenges we ran into

A lot of UI challenges on the web app. Implementing the canvas proved to be quite difficult as there were many different types of interactions that needed to be considered. Also rendering and parsing diffs as well as creating the links between related files was also quite difficult. To get the references to work, figuring out what technologies to use was the only the first hurdle. Past that, using tree sitter to extract symbol information in the diff text and using LSP to find references of said symbols also was quite tricky to implement, especially since we didn't have any experience working with tree-sitter and LSPs prior.

## What we learned

We learned a lot about working with git and especially all the functionality around PRs. Beyond that, we realized through this project that code editors are actually very complex under the hood, and are more than just a text editor.

## What's next for Contify

- more language support
- dragging files in the canvas view
- ai integration

## Screenshots
View related files that reference a function/var that was changed in the PR
<img width="2780" height="1714" alt="image (1)" src="https://github.com/user-attachments/assets/888965f1-e629-4322-9f0a-975b9f24a412" />
Add comments directly on Contify
<img width="2780" height="1714" alt="image (2)" src="https://github.com/user-attachments/assets/82277742-267b-435f-8c9f-91beb7e73320" />
Merge PRs directly on Contify
<img width="2780" height="1714" alt="image (3)" src="https://github.com/user-attachments/assets/5b92cca8-87bd-4921-8940-545aff71a1db" />


