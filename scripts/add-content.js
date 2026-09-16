const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

/*
 * Engineering Reference Content Generator
 *
 * Creates canonical Markdown entities for the Eleventy site.
 *
 * Relationships are stored using stable entity IDs rather than display
 * names. This allows titles and descriptive content to change without
 * breaking relationships elsewhere in the site.
 */


/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const CONTENT_TYPES = [
    "Employer",
    "Position",
    "Project",
    "Competency",
    "Institution",
    "Academic Credential",
    "Coursework",
    "Software",
    "Standard",
    "Certification",
    "Publication"
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


function requireValue(value, fieldName) {
    const trimmed = value.trim();

    if (!trimmed) {
        throw new Error(
            `${fieldName} cannot be empty.`
        );
    }

    return trimmed;
}


async function getDirectories(directory) {
    try {
        const entries = await fs.readdir(
            directory,
            {
                withFileTypes: true
            }
        );

        return entries
            .filter((entry) =>
                entry.isDirectory()
            )
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


async function getEntities(collection) {
    const directory = path.join(
        process.cwd(),
        "src",
        collection
    );

    const ids = await getDirectories(
        directory
    );

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

    await ensureFileDoesNotExist(
        entityFile
    );

    await fs.mkdir(
        entityDirectory,
        {
            recursive: true
        }
    );

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

    entities.forEach(
        (entity, index) => {
            console.log(
                `${index + 1}. ${entity.title}`
            );
        }
    );

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

    entities.forEach(
        (entity, index) => {
            console.log(
                `${index + 1}. ${entity.title}`
            );
        }
    );

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

    return selections.map(
        (selection) => {
            if (
                !Number.isInteger(selection) ||
                selection < 1 ||
                selection > entities.length
            ) {
                throw new Error(
                    "Invalid selection."
                );
            }

            return entities[
                selection - 1
            ].id;
        }
    );
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
            .map(
                (value) =>
                    `  - ${value}`
            )
            .join("\n") +
        "\n"
    );
}


function buildOptionalField(
    name,
    value
) {
    if (!value.trim()) {
        return "";
    }

    return `\n${name}: ${value.trim()}`;
}


/* -------------------------------------------------------------------------- */
/* Employer                                                                   */
/* -------------------------------------------------------------------------- */

async function createEmployer(rl) {
    const title = requireValue(
        await rl.question(
            "\nEmployer name: "
        ),
        "Employer name"
    );

    const id = slugify(title);

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
    const title = requireValue(
        await rl.question(
            "\nPosition title: "
        ),
        "Position title"
    );

    const employers =
        await getEntities("employers");

    const employerId = await selectOne(
        rl,
        "Which employer does this position belong to?",
        employers
    );

    /*
     * Employer ID is included because titles such as
     * "Instructor" or "Systems Engineer" can occur at
     * multiple employers.
     */
    const id = slugify(
        `${employerId}-${title}`
    );

    const markdown = `---
title: ${title}
layout: entity
permalink: /positions/${id}/

id: ${id}
entity: position

employer: ${employerId}
---

`;

    await writeEntityFile(
        "positions",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Project                                                                    */
/* -------------------------------------------------------------------------- */

async function createProject(rl) {
    const title = requireValue(
        await rl.question(
            "\nProject name: "
        ),
        "Project name"
    );

    const id = slugify(title);

    const positions =
        await getEntities("positions");

    const positionId = await selectOne(
        rl,
        "Which position does this project belong to?",
        positions
    );

    const competencies =
        await getEntities("competencies");

    const competencyIds =
        await selectMany(
            rl,
            "Which competencies are associated with this project?",
            competencies
        );

    const software =
        await getEntities("software");

    const softwareIds =
        await selectMany(
            rl,
            "Which software/tools are associated with this project?",
            software
        );

    const standards =
        await getEntities("standards");

    const standardIds =
        await selectMany(
            rl,
            "Which standards are associated with this project?",
            standards
        );

    const markdown = `---
title: ${title}
layout: entity
permalink: /projects/${id}/

id: ${id}
entity: project

position: ${positionId}
${buildListFrontMatter(
    "competencies",
    competencyIds
)}${buildListFrontMatter(
    "software",
    softwareIds
)}${buildListFrontMatter(
    "standards",
    standardIds
)}---

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
    const title = requireValue(
        await rl.question(
            "\nCompetency name: "
        ),
        "Competency name"
    );

    const id = slugify(title);

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
/* Institution                                                                */
/* -------------------------------------------------------------------------- */

async function createInstitution(rl) {
    const title = requireValue(
        await rl.question(
            "\nInstitution name: "
        ),
        "Institution name"
    );

    const id = slugify(title);

    const location = await rl.question(
        "Location (optional): "
    );

    const markdown = `---
title: ${title}
layout: entity
permalink: /institutions/${id}/

id: ${id}
entity: institution${buildOptionalField(
    "location",
    location
)}
---

`;

    await writeEntityFile(
        "institutions",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Academic Credential                                                        */
/* -------------------------------------------------------------------------- */

async function createCredential(rl) {
    const title = requireValue(
        await rl.question(
            "\nAcademic credential title: "
        ),
        "Academic credential title"
    );

    const institutions =
        await getEntities("institutions");

    const institutionId =
        await selectOne(
            rl,
            "Which institution awarded this credential?",
            institutions
        );

    /*
     * Institution ID prevents collisions between similarly named
     * credentials at different schools.
     */
    const id = slugify(
        `${institutionId}-${title}`
    );

    const credentialType =
        await rl.question(
            "Credential type (optional): "
        );

    const field = await rl.question(
        "Field of study (optional): "
    );

    const start = await rl.question(
        "Start date YYYY-MM (optional): "
    );

    const end = await rl.question(
        "End date YYYY-MM (optional): "
    );

    const markdown = `---
title: ${title}
layout: entity
permalink: /credentials/${id}/

id: ${id}
entity: credential

institution: ${institutionId}${buildOptionalField(
    "credential_type",
    credentialType
)}${buildOptionalField(
    "field",
    field
)}${buildOptionalField(
    "start",
    start
)}${buildOptionalField(
    "end",
    end
)}
---

`;

    await writeEntityFile(
        "credentials",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Coursework                                                                 */
/* -------------------------------------------------------------------------- */

async function createCoursework(rl) {
    const institutions =
        await getEntities("institutions");

    const institutionId =
        await selectOne(
            rl,
            "Which institution offered this course?",
            institutions
        );

    const code = requireValue(
        await rl.question(
            "\nCourse code: "
        ),
        "Course code"
    );

    const title = requireValue(
        await rl.question(
            "Course title: "
        ),
        "Course title"
    );

    /*
     * Institution + course code provides a stable ID while allowing
     * the displayed course title to change without changing links.
     */
    const id = slugify(
        `${institutionId}-${code}`
    );

    const credits = await rl.question(
        "Credits (optional): "
    );

    const term = await rl.question(
        "Term (optional): "
    );

    const credentials =
        await getEntities("credentials");

    const credentialIds =
        await selectMany(
            rl,
            "Which academic credentials is this course associated with?",
            credentials
        );

    const competencies =
        await getEntities("competencies");

    const competencyIds =
        await selectMany(
            rl,
            "Which competencies are associated with this course?",
            competencies
        );

    const software =
        await getEntities("software");

    const softwareIds =
        await selectMany(
            rl,
            "Which software/tools are associated with this course?",
            software
        );

    const projects =
        await getEntities("projects");

    const projectIds =
        await selectMany(
            rl,
            "Which projects are associated with this course?",
            projects
        );

    const markdown = `---
title: ${title}
layout: entity
permalink: /coursework/${id}/

id: ${id}
entity: course

institution: ${institutionId}

code: ${code}${buildOptionalField(
    "credits",
    credits
)}${buildOptionalField(
    "term",
    term
)}${buildListFrontMatter(
    "credentials",
    credentialIds
)}${buildListFrontMatter(
    "competencies",
    competencyIds
)}${buildListFrontMatter(
    "software",
    softwareIds
)}${buildListFrontMatter(
    "projects",
    projectIds
)}---

`;

    await writeEntityFile(
        "coursework",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Software                                                                   */
/* -------------------------------------------------------------------------- */

async function createSoftware(rl) {
    const title = requireValue(
        await rl.question(
            "\nSoftware/tool name: "
        ),
        "Software/tool name"
    );

    const id = slugify(title);

    const markdown = `---
title: ${title}
layout: entity
permalink: /software/${id}/

id: ${id}
entity: software
---

`;

    await writeEntityFile(
        "software",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Standard                                                                   */
/* -------------------------------------------------------------------------- */

async function createStandard(rl) {
    const title = requireValue(
        await rl.question(
            "\nStandard name/designation: "
        ),
        "Standard name"
    );

    const id = slugify(title);

    const markdown = `---
title: ${title}
layout: entity
permalink: /standards/${id}/

id: ${id}
entity: standard
---

`;

    await writeEntityFile(
        "standards",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Certification                                                              */
/* -------------------------------------------------------------------------- */

async function createCertification(rl) {
    const title = requireValue(
        await rl.question(
            "\nCertification name: "
        ),
        "Certification name"
    );

    const id = slugify(title);

    const issuer = await rl.question(
        "Issuer (optional): "
    );

    const issued = await rl.question(
        "Issue date YYYY-MM (optional): "
    );

    const competencies =
        await getEntities("competencies");

    const competencyIds =
        await selectMany(
            rl,
            "Which competencies are associated with this certification?",
            competencies
        );

    const markdown = `---
title: ${title}
layout: entity
permalink: /certifications/${id}/

id: ${id}
entity: certification${buildOptionalField(
    "issuer",
    issuer
)}${buildOptionalField(
    "issued",
    issued
)}${buildListFrontMatter(
    "competencies",
    competencyIds
)}---

`;

    await writeEntityFile(
        "certifications",
        id,
        markdown
    );
}


/* -------------------------------------------------------------------------- */
/* Publication                                                                */
/* -------------------------------------------------------------------------- */

async function createPublication(rl) {
    const title = requireValue(
        await rl.question(
            "\nPublication title: "
        ),
        "Publication title"
    );

    const id = slugify(title);

    const year = await rl.question(
        "Publication year (optional): "
    );

    const projects =
        await getEntities("projects");

    const projectIds =
        await selectMany(
            rl,
            "Which projects are associated with this publication?",
            projects
        );

    const competencies =
        await getEntities("competencies");

    const competencyIds =
        await selectMany(
            rl,
            "Which competencies are associated with this publication?",
            competencies
        );

    const markdown = `---
title: ${title}
layout: entity
permalink: /publications/${id}/

id: ${id}
entity: publication${buildOptionalField(
    "year",
    year
)}${buildListFrontMatter(
    "projects",
    projectIds
)}${buildListFrontMatter(
    "competencies",
    competencyIds
)}---

`;

    await writeEntityFile(
        "publications",
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

            case "Institution":
                await createInstitution(rl);
                break;

            case "Academic Credential":
                await createCredential(rl);
                break;

            case "Coursework":
                await createCoursework(rl);
                break;

            case "Software":
                await createSoftware(rl);
                break;

            case "Standard":
                await createStandard(rl);
                break;

            case "Certification":
                await createCertification(rl);
                break;

            case "Publication":
                await createPublication(rl);
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