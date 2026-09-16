const fs = require("node:fs/promises");
const path = require("node:path");

/*
 * Engineering Reference Content Validator
 *
 * Validates the canonical Markdown content used by the Eleventy site.
 *
 * The validator checks both structural correctness and relationships
 * between entities. Relationships use stable IDs rather than display
 * names so titles can change without breaking the site's data graph.
 */


/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const SRC_DIRECTORY = path.join(
    process.cwd(),
    "src"
);

/*
 * Each collection defines the singular entity value expected in the
 * front matter of files stored in that collection.
 */
const COLLECTIONS = {
    employers: "employer",
    positions: "position",
    projects: "project",
    competencies: "competency",
    institutions: "institution",
    credentials: "credential",
    coursework: "course",
    software: "software",
    standards: "standard",
    certifications: "certification",
    publications: "publication"
};

const REQUIRED_FIELDS = [
    "title",
    "layout",
    "permalink",
    "id",
    "entity"
];


/* -------------------------------------------------------------------------- */
/* File Utilities                                                             */
/* -------------------------------------------------------------------------- */

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


/* -------------------------------------------------------------------------- */
/* Front Matter Parser                                                        */
/* -------------------------------------------------------------------------- */

/*
 * The project currently uses deliberately simple YAML front matter.
 *
 * Rather than introducing another dependency, this parser supports the
 * structures currently used by the site:
 *
 *     field: value
 *
 * and:
 *
 *     field:
 *       - value
 *       - value
 *
 * If the content model later requires nested YAML objects, this parser
 * should be replaced with a dedicated YAML parser.
 */
function parseFrontMatter(content) {
    const match = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---/
    );

    if (!match) {
        return null;
    }

    const lines = match[1].split(/\r?\n/);
    const data = {};

    let currentList = null;

    for (const line of lines) {
        const listMatch = line.match(
            /^\s+-\s+(.+)$/
        );

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

        const [, key, rawValue] =
            fieldMatch;

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


/* -------------------------------------------------------------------------- */
/* Content Loading                                                            */
/* -------------------------------------------------------------------------- */

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
/* Structural Validation                                                      */
/* -------------------------------------------------------------------------- */

function validateRequiredFields(
    entity,
    errors
) {
    const location =
        `${entity.collection}/${entity.folder}`;

    if (entity.error) {
        errors.push(
            `${location}: ${entity.error}`
        );

        return;
    }

    if (!entity.data) {
        errors.push(
            `${location}: Missing or invalid front matter`
        );

        return;
    }

    for (const field of REQUIRED_FIELDS) {
        if (!entity.data[field]) {
            errors.push(
                `${location}: Missing "${field}"`
            );
        }
    }
}


function validateFolderId(
    entity,
    errors
) {
    if (!entity.data?.id) {
        return;
    }

    if (entity.data.id !== entity.folder) {
        errors.push(
            `${entity.collection}/${entity.folder}: ` +
            `Folder name does not match id "${entity.data.id}"`
        );
    }
}


function validateEntityType(
    entity,
    errors
) {
    if (!entity.data?.entity) {
        return;
    }

    const expected =
        COLLECTIONS[entity.collection];

    if (entity.data.entity !== expected) {
        errors.push(
            `${entity.collection}/${entity.folder}: ` +
            `Expected entity "${expected}" but found "${entity.data.entity}"`
        );
    }
}


function validatePermalink(
    entity,
    errors
) {
    if (
        !entity.data?.permalink ||
        !entity.data?.id
    ) {
        return;
    }

    const expected =
        `/${entity.collection}/${entity.data.id}/`;

    if (entity.data.permalink !== expected) {
        errors.push(
            `${entity.collection}/${entity.folder}: ` +
            `Expected permalink "${expected}" but found "${entity.data.permalink}"`
        );
    }
}


function validateDuplicateIds(
    entities,
    errors
) {
    const ids = new Map();

    for (const entity of entities) {
        if (!entity.data?.id) {
            continue;
        }

        const location =
            `${entity.collection}/${entity.folder}`;

        const existing = ids.get(
            entity.data.id
        );

        if (existing) {
            errors.push(
                `Duplicate id "${entity.data.id}" found in ` +
                `${existing} and ${location}`
            );
        } else {
            ids.set(
                entity.data.id,
                location
            );
        }
    }
}


/* -------------------------------------------------------------------------- */
/* Relationship Utilities                                                     */
/* -------------------------------------------------------------------------- */

function getIds(collection) {
    return new Set(
        collection
            .map((entity) =>
                entity.data?.id
            )
            .filter(Boolean)
    );
}


function validateReference({
    entity,
    field,
    validIds,
    required = false,
    errors
}) {
    if (!entity.data) {
        return;
    }

    const value = entity.data[field];

    if (!value) {
        if (required) {
            errors.push(
                `${entity.collection}/${entity.folder}: ` +
                `Missing ${field} relationship`
            );
        }

        return;
    }

    if (Array.isArray(value)) {
        errors.push(
            `${entity.collection}/${entity.folder}: ` +
            `"${field}" must contain a single ID`
        );

        return;
    }

    if (!validIds.has(value)) {
        errors.push(
            `${entity.collection}/${entity.folder}: ` +
            `Unknown ${field} "${value}"`
        );
    }
}


function validateReferenceList({
    entity,
    field,
    validIds,
    errors
}) {
    if (!entity.data) {
        return;
    }

    const values = entity.data[field];

    if (values === undefined) {
        return;
    }

    if (!Array.isArray(values)) {
        errors.push(
            `${entity.collection}/${entity.folder}: ` +
            `"${field}" must be a list`
        );

        return;
    }

    for (const value of values) {
        if (!validIds.has(value)) {
            errors.push(
                `${entity.collection}/${entity.folder}: ` +
                `Unknown ${field} ID "${value}"`
            );
        }
    }
}


/* -------------------------------------------------------------------------- */
/* Relationship Validation                                                    */
/* -------------------------------------------------------------------------- */

function validateRelationships(
    collections,
    errors
) {
    const employerIds =
        getIds(collections.employers);

    const positionIds =
        getIds(collections.positions);

    const competencyIds =
        getIds(collections.competencies);

    const institutionIds =
        getIds(collections.institutions);

    const credentialIds =
        getIds(collections.credentials);

    const softwareIds =
        getIds(collections.software);

    const standardIds =
        getIds(collections.standards);

    const projectIds =
        getIds(collections.projects);


    /*
     * Position -> Employer
     */
    for (const position of collections.positions) {
        validateReference({
            entity: position,
            field: "employer",
            validIds: employerIds,
            required: true,
            errors
        });
    }


    /*
     * Project -> Position
     *
     * Projects may additionally reference competencies,
     * software, and standards.
     */
    for (const project of collections.projects) {
        validateReference({
            entity: project,
            field: "position",
            validIds: positionIds,
            required: true,
            errors
        });

        validateReferenceList({
            entity: project,
            field: "competencies",
            validIds: competencyIds,
            errors
        });

        validateReferenceList({
            entity: project,
            field: "software",
            validIds: softwareIds,
            errors
        });

        validateReferenceList({
            entity: project,
            field: "standards",
            validIds: standardIds,
            errors
        });
    }


    /*
     * Academic Credential -> Institution
     */
    for (
        const credential
        of collections.credentials
    ) {
        validateReference({
            entity: credential,
            field: "institution",
            validIds: institutionIds,
            required: true,
            errors
        });
    }


    /*
     * Course -> Institution
     *
     * A course may belong to zero, one, or multiple academic
     * credentials. Multiple credentials are useful when coursework
     * contributes to overlapping programs such as a graduate degree
     * and graduate certificate.
     */
    for (const course of collections.coursework) {
        validateReference({
            entity: course,
            field: "institution",
            validIds: institutionIds,
            required: true,
            errors
        });

        validateReferenceList({
            entity: course,
            field: "credentials",
            validIds: credentialIds,
            errors
        });

        validateReferenceList({
            entity: course,
            field: "competencies",
            validIds: competencyIds,
            errors
        });

        validateReferenceList({
            entity: course,
            field: "software",
            validIds: softwareIds,
            errors
        });

        validateReferenceList({
            entity: course,
            field: "projects",
            validIds: projectIds,
            errors
        });
    }


    /*
     * Publications can connect back to projects and competencies.
     *
     * These relationships are optional because not every publication
     * necessarily originates from a project represented on the site.
     */
    for (
        const publication
        of collections.publications
    ) {
        validateReferenceList({
            entity: publication,
            field: "projects",
            validIds: projectIds,
            errors
        });

        validateReferenceList({
            entity: publication,
            field: "competencies",
            validIds: competencyIds,
            errors
        });
    }


    /*
     * Certifications may be associated with competencies.
     */
    for (
        const certification
        of collections.certifications
    ) {
        validateReferenceList({
            entity: certification,
            field: "competencies",
            validIds: competencyIds,
            errors
        });
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

    for (
        const collection
        of Object.keys(COLLECTIONS)
    ) {
        collections[collection] =
            await loadCollection(
                collection
            );
    }

    const allEntities =
        Object.values(collections).flat();

    const errors = [];

    for (const entity of allEntities) {
        validateRequiredFields(
            entity,
            errors
        );

        validateFolderId(
            entity,
            errors
        );

        validateEntityType(
            entity,
            errors
        );

        validatePermalink(
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

        for (const error of errors) {
            console.error(
                `- ${error}`
            );
        }

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