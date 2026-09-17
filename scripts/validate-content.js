const fs = require("node:fs/promises");
const path = require("node:path");

/*
 * Engineering Reference Content Validator
 *
 * Validates canonical Markdown content used by the Eleventy site.
 *
 * The validator checks:
 *   - Required front-matter fields
 *   - Folder ID / front-matter ID consistency
 *   - Entity type consistency
 *   - Permalink consistency
 *   - Duplicate IDs within each collection
 *   - Relationships between canonical entities
 */


/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const SRC_DIRECTORY = path.join(
    process.cwd(),
    "src"
);

const COLLECTIONS = {
    employers: "employer",
    positions: "position",
    projects: "project",
    competencies: "competency",
    institutions: "institution",
    credentials: "credential",
    studies: "study",
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
 * The site currently uses deliberately simple YAML front matter.
 *
 * Supported structures:
 *
 *     field: value
 *
 * and:
 *
 *     field:
 *       - value
 *       - value
 *
 * If nested YAML objects become necessary later, this parser should be
 * replaced with a dedicated YAML parser.
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
            `Expected entity "${expected}" but found ` +
            `"${entity.data.entity}"`
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
            `Expected permalink "${expected}" but found ` +
            `"${entity.data.permalink}"`
        );
    }
}


/*
 * IDs must be unique within a collection.
 *
 * The same real-world organization may legitimately appear in more than
 * one collection. For example, Zane State College can be both an employer
 * and an academic institution.
 */

function validateDuplicateIds(
    collections,
    errors
) {
    for (
        const [collectionName, entities]
        of Object.entries(collections)
    ) {
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
                    `Duplicate id "${entity.data.id}" found in ` +
                    `${collectionName}/${existing} and ` +
                    `${collectionName}/${entity.folder}`
                );
            } else {
                ids.set(
                    entity.data.id,
                    entity.folder
                );
            }
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

    const studyIds =
        getIds(collections.studies);

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
     * Project Relationships
     *
     * Professional projects may reference a position.
     *
     * Academic projects may reference an institution.
     *
     * Personal, open-source, research, and independent projects may
     * exist without either relationship.
     *
     * When a position or institution relationship is supplied, the
     * referenced entity must exist.
     *
     * Projects may additionally reference competencies, software,
     * and engineering standards.
     */

    for (const project of collections.projects) {
        validateReference({
            entity: project,
            field: "position",
            validIds: positionIds,
            errors
        });

        validateReference({
            entity: project,
            field: "institution",
            validIds: institutionIds,
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
     * Non-Degree Study -> Institution
     */

    for (const study of collections.studies) {
        validateReference({
            entity: study,
            field: "institution",
            validIds: institutionIds,
            required: true,
            errors
        });
    }


    /*
     * Course -> Academic Record
     *
     * Every course belongs to an institution.
     *
     * Degree/certificate coursework references one or more academic
     * credentials using "credentials".
     *
     * Non-degree coursework references a study period using "study".
     *
     * A course must use one form or the other, but not both.
     */

    for (const course of collections.coursework) {
        validateReference({
            entity: course,
            field: "institution",
            validIds: institutionIds,
            required: true,
            errors
        });

        const credentials =
            course.data?.credentials;

        const study =
            course.data?.study;

        const hasCredentials =
            Array.isArray(credentials) &&
            credentials.length > 0;

        const hasStudy =
            typeof study === "string" &&
            study.length > 0;

        if (!hasCredentials && !hasStudy) {
            errors.push(
                `coursework/${course.folder}: ` +
                `Missing academic record relationship; ` +
                `expected "credentials" or "study"`
            );
        }

        if (hasCredentials && hasStudy) {
            errors.push(
                `coursework/${course.folder}: ` +
                `Course cannot reference both "credentials" and "study"`
            );
        }

        validateReferenceList({
            entity: course,
            field: "credentials",
            validIds: credentialIds,
            errors
        });

        validateReference({
            entity: course,
            field: "study",
            validIds: studyIds,
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
     * Publication -> Projects / Competencies
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
     * Certification -> Competencies
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
        collections,
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