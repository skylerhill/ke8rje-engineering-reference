const fs = require("node:fs/promises");
const path = require("node:path");

/*
 * Engineering Reference Content Validator
 *
 * Checks canonical Markdown content for structural and relationship errors.
 *
 * Current checks:
 *   - Missing index.md files
 *   - Missing required front-matter fields
 *   - Folder ID / front-matter ID mismatches
 *   - Duplicate entity IDs
 *   - Positions referencing nonexistent employers
 *   - Projects referencing nonexistent positions
 *   - Projects referencing nonexistent competencies
 */

const SRC_DIRECTORY = path.join(process.cwd(), "src");

const COLLECTIONS = [
    "employers",
    "positions",
    "projects",
    "competencies"
];


/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

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


function parseFrontMatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

    if (!match) {
        return null;
    }

    const lines = match[1].split(/\r?\n/);
    const data = {};

    let currentList = null;

    for (const line of lines) {
        const listMatch = line.match(/^\s+-\s+(.+)$/);

        if (listMatch && currentList) {
            data[currentList].push(
                listMatch[1].trim()
            );

            continue;
        }

        const fieldMatch = line.match(
            /^([A-Za-z0-9_-]+):\s*(.*)$/
        );

        if (!fieldMatch) {
            continue;
        }

        const [, key, rawValue] = fieldMatch;
        const value = rawValue.trim();

        if (value === "") {
            data[key] = [];
            currentList = key;
        } else {
            data[key] = value;
            currentList = null;
        }
    }

    return data;
}


async function loadCollection(collection) {
    const directory = path.join(
        SRC_DIRECTORY,
        collection
    );

    const folders = await getDirectories(
        directory
    );

    const entities = [];

    for (const folder of folders) {
        const filePath = path.join(
            directory,
            folder,
            "index.md"
        );

        let content;

        try {
            content = await fs.readFile(
                filePath,
                "utf8"
            );
        } catch (error) {
            if (error.code === "ENOENT") {
                entities.push({
                    collection,
                    folder,
                    filePath,
                    error: "Missing index.md"
                });

                continue;
            }

            throw error;
        }

        entities.push({
            collection,
            folder,
            filePath,
            data: parseFrontMatter(content)
        });
    }

    return entities;
}


/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function validateRequiredFields(entity, errors) {
    if (entity.error) {
        errors.push(
            `${entity.collection}/${entity.folder}: ${entity.error}`
        );

        return;
    }

    if (!entity.data) {
        errors.push(
            `${entity.collection}/${entity.folder}: Missing or invalid front matter`
        );

        return;
    }

    const required = [
        "title",
        "layout",
        "permalink",
        "id",
        "entity"
    ];

    for (const field of required) {
        if (!entity.data[field]) {
            errors.push(
                `${entity.collection}/${entity.folder}: Missing "${field}"`
            );
        }
    }

    if (
        entity.data.id &&
        entity.data.id !== entity.folder
    ) {
        errors.push(
            `${entity.collection}/${entity.folder}: Folder name does not match id "${entity.data.id}"`
        );
    }
}


function validateDuplicateIds(entities, errors) {
    const ids = new Map();

    for (const entity of entities) {
        if (!entity.data?.id) {
            continue;
        }

        const existing = ids.get(
            entity.data.id
        );

        if (existing) {
            errors.push(
                `Duplicate id "${entity.data.id}" found in ${existing} and ${entity.collection}/${entity.folder}`
            );
        } else {
            ids.set(
                entity.data.id,
                `${entity.collection}/${entity.folder}`
            );
        }
    }
}


function validateRelationships(
    collections,
    errors
) {
    const employerIds = new Set(
        collections.employers
            .map((entity) => entity.data?.id)
            .filter(Boolean)
    );

    const positionIds = new Set(
        collections.positions
            .map((entity) => entity.data?.id)
            .filter(Boolean)
    );

    const competencyIds = new Set(
        collections.competencies
            .map((entity) => entity.data?.id)
            .filter(Boolean)
    );

    for (const position of collections.positions) {
        if (!position.data) {
            continue;
        }

        const employerId =
            position.data.employer;

        if (!employerId) {
            errors.push(
                `positions/${position.folder}: Missing employer relationship`
            );

            continue;
        }

        if (!employerIds.has(employerId)) {
            errors.push(
                `positions/${position.folder}: Unknown employer "${employerId}"`
            );
        }
    }

    for (const project of collections.projects) {
        if (!project.data) {
            continue;
        }

        const positionId =
            project.data.position;

        if (!positionId) {
            errors.push(
                `projects/${project.folder}: Missing position relationship`
            );
        } else if (!positionIds.has(positionId)) {
            errors.push(
                `projects/${project.folder}: Unknown position "${positionId}"`
            );
        }

        const competencies =
            project.data.competencies || [];

        if (!Array.isArray(competencies)) {
            errors.push(
                `projects/${project.folder}: "competencies" must be a list`
            );

            continue;
        }

        for (const competencyId of competencies) {
            if (!competencyIds.has(competencyId)) {
                errors.push(
                    `projects/${project.folder}: Unknown competency "${competencyId}"`
                );
            }
        }
    }
}


/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
    console.log(
        "\nEngineering Reference — Validate Content\n"
    );

    const collections = {};

    for (const collection of COLLECTIONS) {
        collections[collection] =
            await loadCollection(collection);
    }

    const allEntities =
        Object.values(collections).flat();

    const errors = [];

    for (const entity of allEntities) {
        validateRequiredFields(
            entity,
            errors
        );
    }

    validateDuplicateIds(
        allEntities,
        errors
    );

    validateRelationships(
        collections,
        errors
    );

    if (errors.length > 0) {
        console.error(
            `Found ${errors.length} validation error(s):\n`
        );

        errors.forEach((error) => {
            console.error(`- ${error}`);
        });

        process.exitCode = 1;
        return;
    }

    console.log(
        `Validated ${allEntities.length} entities.`
    );

    console.log(
        "No content errors found."
    );
}


main().catch((error) => {
    console.error(
        `\nValidation failed: ${error.message}`
    );

    process.exitCode = 1;
});