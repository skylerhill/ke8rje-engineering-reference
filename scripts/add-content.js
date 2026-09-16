const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

/*
 * Engineering Reference Content Generator
 *
 * Creates canonical Markdown content for the Eleventy site.
 *
 * Relationships are stored using stable entity IDs rather than display
 * names. This allows titles and page content to change without breaking
 * relationships elsewhere in the site.
 */

const CONTENT_TYPES = [
    "Employer",
    "Position",
    "Project",
    "Competency",
    "Education",
    "Software",
    "Standard"
];


/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}


async function getDirectories(directory) {
    try {
        const entries = await fs.readdir(directory, {
            withFileTypes: true
        });

        return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }

        throw error;
    }
}


async function getEntityTitle(directory, id) {
    const filePath = path.join(
        directory,
        id,
        "index.md"
    );

    const content = await fs.readFile(
        filePath,
        "utf8"
    );

    const titleMatch = content.match(
        /^title:\s*(.+)$/m
    );

    if (!titleMatch) {
        throw new Error(
            `No title found for "${id}".`
        );
    }

    return titleMatch[1].trim();
}


async function getEntities(directory) {
    const ids = await getDirectories(directory);

    const entities = await Promise.all(
        ids.map(async (id) => ({
            id,
            title: await getEntityTitle(
                directory,
                id
            )
        }))
    );

    return entities.sort((a, b) =>
        a.title.localeCompare(b.title)
    );
}


async function ensureFileDoesNotExist(filePath) {
    try {
        await fs.access(filePath);

        throw new Error(
            `Content already exists at "${filePath}".`
        );
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}


async function writeEntityFile(
    collection,
    id,
    markdown
) {
    const entityDirectory = path.join(
        process.cwd(),
        "src",
        collection,
        id
    );

    const entityFile = path.join(
        entityDirectory,
        "index.md"
    );

    await ensureFileDoesNotExist(entityFile);

    await fs.mkdir(entityDirectory, {
        recursive: true
    });

    await fs.writeFile(
        entityFile,
        markdown,
        "utf8"
    );

    console.log(
        `\nCreated: src/${collection}/${id}/index.md`
    );
}


/* -------------------------------------------------------------------------- */
/* Selection Helpers                                                          */
/* -------------------------------------------------------------------------- */

async function selectOne(
    rl,
    prompt,
    entities
) {
    if (entities.length === 0) {
        throw new Error(
            "No available items found."
        );
    }

    console.log(`\n${prompt}\n`);

    entities.forEach((entity, index) => {
        console.log(
            `${index + 1}. ${entity.title}`
        );
    });

    const answer = await rl.question(
        "\nSelect an item: "
    );

    const selection = Number.parseInt(
        answer.trim(),
        10
    );

    if (
        !Number.isInteger(selection) ||
        selection < 1 ||
        selection > entities.length
    ) {
        throw new Error(
            "Invalid selection."
        );
    }

    return entities[selection - 1].id;
}


async function selectMany(
    rl,
    prompt,
    entities
) {
    if (entities.length === 0) {
        return [];
    }

    console.log(`\n${prompt}\n`);

    entities.forEach((entity, index) => {
        console.log(
            `${index + 1}. ${entity.title}`
        );
    });

    const answer = await rl.question(
        "\nSelect items (comma-separated, or press Enter for none): "
    );

    if (!answer.trim()) {
        return [];
    }

    const selections = [
        ...new Set(
            answer
                .split(",")
                .map((value) =>
                    Number.parseInt(
                        value.trim(),
                        10
                    )
                )
        )
    ];

    return selections.map((selection) => {
        if (
            !Number.isInteger(selection) ||
            selection < 1 ||
            selection > entities.length
        ) {
            throw new Error(
                "Invalid selection."
            );
        }

        return entities[selection - 1].id;
    });
}


/* -------------------------------------------------------------------------- */
/* Front Matter Helpers                                                       */
/* -------------------------------------------------------------------------- */

function buildListFrontMatter(
    name,
    values
) {
    if (!values.length) {
        return "";
    }

    return (
        `\n${name}:\n` +
        values
            .map((value) => `  - ${value}`)
            .join("\n") +
        "\n"
    );
}


/* -------------------------------------------------------------------------- */
/* Employer                                                                   */
/* -------------------------------------------------------------------------- */

async function createEmployer(rl) {
    const title = (
        await rl.question("\nEmployer name: ")
    ).trim();

    const id = slugify(title);

    if (!id) {
        throw new Error(
            "Employer name cannot be empty."
        );
    }

    const markdown = `---
title: ${title}
layout: entity
permalink: /employers/${id}/

id: ${id}
entity: employer
---

`;

    await writeEntityFile(
        "employers",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Position                                                                   */
/* -------------------------------------------------------------------------- */

async function createPosition(rl) {
    const title = (
        await rl.question("\nPosition title: ")
    ).trim();

    const id = slugify(title);

    if (!id) {
        throw new Error(
            "Position title cannot be empty."
        );
    }

    const employersDirectory = path.join(
        process.cwd(),
        "src",
        "employers"
    );

    const employers = await getEntities(
        employersDirectory
    );

    const employerId = await selectOne(
        rl,
        "Which employer does this position belong to?",
        employers
    );

    /*
     * Include the employer ID in the position ID.
     *
     * Example:
     *   Employer: Boeing
     *   Position: Systems Engineer
     *   ID: boeing-systems-engineer
     */
    const positionId = slugify(
        `${employerId}-${title}`
    );

    const markdown = `---
title: ${title}
layout: entity
permalink: /positions/${positionId}/

id: ${positionId}
entity: position

employer: ${employerId}
---

`;

    await writeEntityFile(
        "positions",
        positionId,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Project                                                                    */
/* -------------------------------------------------------------------------- */

async function createProject(rl) {
    const title = (
        await rl.question("\nProject name: ")
    ).trim();

    const id = slugify(title);

    if (!id) {
        throw new Error(
            "Project name cannot be empty."
        );
    }

    /*
     * Check for duplicates before asking the user
     * additional relationship questions.
     */
    const projectFile = path.join(
        process.cwd(),
        "src",
        "projects",
        id,
        "index.md"
    );

    await ensureFileDoesNotExist(
        projectFile
    );

    const positionsDirectory = path.join(
        process.cwd(),
        "src",
        "positions"
    );

    const positions = await getEntities(
        positionsDirectory
    );

    const positionId = await selectOne(
        rl,
        "Which position does this project belong to?",
        positions
    );

    const competenciesDirectory = path.join(
        process.cwd(),
        "src",
        "competencies"
    );

    const competencies = await getEntities(
        competenciesDirectory
    );

    const competencyIds = await selectMany(
        rl,
        "Which competencies are associated with this project?",
        competencies
    );

    const competenciesFrontMatter =
        buildListFrontMatter(
            "competencies",
            competencyIds
        );

    const markdown = `---
title: ${title}
layout: entity
permalink: /projects/${id}/

id: ${id}
entity: project

position: ${positionId}
${competenciesFrontMatter}---

`;

    await writeEntityFile(
        "projects",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Competency                                                                 */
/* -------------------------------------------------------------------------- */

async function createCompetency(rl) {
    const title = (
        await rl.question(
            "\nCompetency name: "
        )
    ).trim();

    const id = slugify(title);

    if (!id) {
        throw new Error(
            "Competency name cannot be empty."
        );
    }

    const markdown = `---
title: ${title}
layout: entity
permalink: /competencies/${id}/

id: ${id}
entity: competency
---

`;

    await writeEntityFile(
        "competencies",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
    const rl = readline.createInterface({
        input,
        output
    });

    try {
        console.log(
            "\nEngineering Reference — Add Content\n"
        );

        CONTENT_TYPES.forEach(
            (type, index) => {
                console.log(
                    `${index + 1}. ${type}`
                );
            }
        );

        const answer = await rl.question(
            "\nSelect a content type: "
        );

        const selection = Number.parseInt(
            answer.trim(),
            10
        );

        if (
            !Number.isInteger(selection) ||
            selection < 1 ||
            selection > CONTENT_TYPES.length
        ) {
            throw new Error(
                "Invalid content type selection."
            );
        }

        const type =
            CONTENT_TYPES[selection - 1];

        console.log(
            `\nSelected content type: ${type}`
        );

        switch (type) {
            case "Employer":
                await createEmployer(rl);
                break;

            case "Position":
                await createPosition(rl);
                break;

            case "Project":
                await createProject(rl);
                break;

            case "Competency":
                await createCompetency(rl);
                break;

            case "Education":
            case "Software":
            case "Standard":
                console.log(
                    `\n${type} creation will be added after its content model is defined.`
                );
                break;

            default:
                throw new Error(
                    "Unsupported content type."
                );
        }
    } finally {
        rl.close();
    }
}


main().catch((error) => {
    console.error(
        `\nError: ${error.message}`
    );

    process.exitCode = 1;
});