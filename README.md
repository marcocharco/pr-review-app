# Contify


<p align="center">
  <br/>
  <i>Context-aware code review on an interactive infinite canvas</i>
  <img width="1640" alt="screenshot" src="https://github.com/user-attachments/assets/8119e873-065a-433e-b1d8-e8bad3903a56">
</p>



## Inspiration

We both have a lot of experience dealing with PRs and they are often a big headache. We wanted to create a visual interface that allows us to see not only the changes in the PR but also files related to those changes. Having seen HackWestern's website this year, as well as many other infinite canvas visualization tools, we thought this would be a great use case.

## What it does

Contify is a CLI-driven tool for reviewing GitHub pull requests. It retrieves a PR, parses patch data to find the spans of modified code, and visualizes them in an interactive canvas interface. For each change, Contify can locate and display related variable and function usage references across the codebase, allowing reviewers to assess the blast radius of a PR by viewing affected code side by side. The tool supports GitHub OAuth for authentication and enables actions such as commenting on and merging pull requests from within the application.

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

- More language support
- Dragging files in the canvas view
- Ai integration

## Additional Screenshots

<p align="center">
  <img width="850" alt="Comments Feature" src="https://github.com/user-attachments/assets/82277742-267b-435f-8c9f-91beb7e73320" />
  <br/>
  <span>Add inline comments on changes</span>
</p>

<br/>


<p align="center">
  <img width="850" alt="Merge Feature" src="https://github.com/user-attachments/assets/5b92cca8-87bd-4921-8940-545aff71a1db" />
  <br/>
  <span>Merge PRs</span>
</p>


