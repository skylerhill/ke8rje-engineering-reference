const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");


/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const ROOT_DIRECTORY = process.cwd();

const SRC_DIRECTORY = path.join(
    ROOT_DIRECTORY,
    "src"
);

const IMPORT_DIRECTORY = path.join(
    ROOT_DIRECTORY,
    "data",
    "imports"
);

const VALIDATOR = path.join(
    ROOT_DIRECTORY,
    "scripts",
    "validate-content.js"
);


/* -------------------------------------------------------------------------- */
/* YAML Utilities                                                             */
/* -------------------------------------------------------------------------- */

function yamlScalar(value) {
    const text = String(value);

    const ambiguousWords =
        /^(?:true|false|null|yes|no|on|off|~)$/i;

    const numericLike =
        /^[-+]?(?:\d+|\d*\.\d+)$/;

    const unsafeCharacters =
        /[:#[\]{},&*!|>'"%@`]/;

    const unsafeWhitespace =
        /^\s|\s$/;

    if (
        text === "" ||
        ambiguousWords.test(text) ||
        numericLike.test(text) ||
        unsafeCharacters.test(text) ||
        unsafeWhitespace.test(text)
    ) {
        return JSON.stringify(text);
    }

    return text;
}


function buildScalarField(name, value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "";
    }

    return `${name}: ${yamlScalar(value)}\n`;
}


function buildListField(name, values) {
    if (
        !Array.isArray(values) ||
        values.length === 0
    ) {
        return "";
    }

    const items = values
        .map((value) => `  - ${yamlScalar(value)}`)
        .join("\n");

    return `${name}:\n${items}\n`;
}


/* -------------------------------------------------------------------------- */
/* Import File Loading                                                        */
/* -------------------------------------------------------------------------- */

async function loadImportFiles() {
    let entries;

    try {
        entries = await fs.readdir(
            IMPORT_DIRECTORY,
            {
                withFileTypes: true
            }
        );
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(
                `Import directory does not exist: ${IMPORT_DIRECTORY}`
            );
        }

        throw error;
    }

    const jsonFiles = entries
        .filter(
            (entry) =>
                entry.isFile() &&
                entry.name.toLowerCase().endsWith(".json")
        )
        .map((entry) => entry.name)
        .sort();

    if (jsonFiles.length === 0) {
        throw new Error(
            `No JSON import files found in ${IMPORT_DIRECTORY}`
        );
    }

    const groups = [];

    for (const fileName of jsonFiles) {
        const filePath = path.join(
            IMPORT_DIRECTORY,
            fileName
        );

        const raw = await fs.readFile(
            filePath,
            "utf8"
        );

        let parsed;

        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error(
                `${fileName}: invalid JSON: ${error.message}`
            );
        }

        validateImportFile(
            fileName,
            parsed
        );

        groups.push({
            fileName,
            ...parsed
        });
    }

    return groups;
}


/* -------------------------------------------------------------------------- */
/* Import File Validation                                                     */
/* -------------------------------------------------------------------------- */

function validateImportFile(
    fileName,
    group
) {
    if (
        !group ||
        typeof group !== "object" ||
        Array.isArray(group)
    ) {
        throw new Error(
            `${fileName}: root value must be an object.`
        );
    }

    if (
        typeof group.collection !== "string" ||
        group.collection.trim() === ""
    ) {
        throw new Error(
            `${fileName}: missing collection.`
        );
    }

    if (
        typeof group.entity !== "string" ||
        group.entity.trim() === ""
    ) {
        throw new Error(
            `${fileName}: missing entity.`
        );
    }

    if (!Array.isArray(group.items)) {
        throw new Error(
            `${fileName}: items must be an array.`
        );
    }

    const ids = new Set();

    for (const [index, item] of group.items.entries()) {
        if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item)
        ) {
            throw new Error(
                `${fileName}: item ${index + 1} must be an object.`
            );
        }

        if (
            typeof item.id !== "string" ||
            item.id.trim() === ""
        ) {
            throw new Error(
                `${fileName}: item ${index + 1} is missing id.`
            );
        }

        if (
            typeof item.title !== "string" ||
            item.title.trim() === ""
        ) {
            throw new Error(
                `${fileName}: ${item.id} is missing title.`
            );
        }

        if (ids.has(item.id)) {
            throw new Error(
                `${fileName}: duplicate id "${item.id}".`
            );
        }

        ids.add(item.id);
    }
}


/* -------------------------------------------------------------------------- */
/* Markdown Builder                                                           */
/* -------------------------------------------------------------------------- */

/*
 * These fields are emitted first and in a predictable order.
 *
 * Keeping deterministic ordering makes generated Markdown easy to review
 * and keeps restart-safety meaningful.
 */
const FIELD_ORDER = [
    "institution",
    "location",

    "credential_type",
    "study_type",
    "field",
    "concentration",

    "code",
    "credits",
    "term",

    "start",
    "end",

    "employer",
    "position",
    "study",

    "credentials",
    "competencies",
    "software",
    "projects",
    "standards"
];


/*
 * Properties used by the importer itself rather than written as ordinary
 * front-matter fields.
 */
const RESERVED_FIELDS = new Set([
    "id",
    "title",
    "description"
]);


function buildDataField(
    name,
    value
) {
    if (Array.isArray(value)) {
        return buildListField(
            name,
            value
        );
    }

    return buildScalarField(
        name,
        value
    );
}


function buildMarkdown(
    collection,
    entity,
    item
) {
    let output = "---\n";

    output +=
        `title: ${yamlScalar(item.title)}\n`;

    output +=
        "layout: entity\n";

    output +=
        `permalink: /${collection}/${item.id}/\n`;

    output += "\n";

    output +=
        `id: ${yamlScalar(item.id)}\n`;

    output +=
        `entity: ${yamlScalar(entity)}\n`;


    /* ---------------------------------------------------------------------- */
    /* Known Fields                                                           */
    /* ---------------------------------------------------------------------- */

    const emitted = new Set();

    for (const field of FIELD_ORDER) {
        if (
            Object.prototype.hasOwnProperty.call(
                item,
                field
            )
        ) {
            output += buildDataField(
                field,
                item[field]
            );

            emitted.add(field);
        }
    }


    /* ---------------------------------------------------------------------- */
    /* Additional Fields                                                      */
    /* ---------------------------------------------------------------------- */

    /*
     * This is what makes the importer content-agnostic.
     *
     * A future entity can introduce a simple scalar or list field in its JSON
     * import data without requiring another hard-coded branch in this script.
     */
    const additionalFields =
        Object.keys(item)
            .filter(
                (field) =>
                    !RESERVED_FIELDS.has(field) &&
                    !emitted.has(field)
            )
            .sort();

    for (const field of additionalFields) {
        output += buildDataField(
            field,
            item[field]
        );
    }


    /* ---------------------------------------------------------------------- */
    /* Markdown Body                                                          */
    /* ---------------------------------------------------------------------- */

    output += "---\n\n";

    const description =
        typeof item.description === "string"
            ? item.description.trim()
            : "";

    if (description) {
        output += `${description}\n`;
    }

    return output;
}


/* -------------------------------------------------------------------------- */
/* File Utilities                                                             */
/* -------------------------------------------------------------------------- */

async function ensureDirectory(directory) {
    await fs.mkdir(
        directory,
        {
            recursive: true
        }
    );
}


/* -------------------------------------------------------------------------- */
/* Entity Import                                                              */
/* -------------------------------------------------------------------------- */

async function importEntity(
    group,
    item
) {
    const directory = path.join(
        SRC_DIRECTORY,
        group.collection,
        item.id
    );

    const filePath = path.join(
        directory,
        "index.md"
    );

    const expectedContent =
        buildMarkdown(
            group.collection,
            group.entity,
            item
        );

    await ensureDirectory(directory);

    try {
        const existingContent =
            await fs.readFile(
                filePath,
                "utf8"
            );

        if (
            existingContent ===
            expectedContent
        ) {
            console.log(
                `Unchanged: ${group.collection}/${item.id}`
            );

            return "unchanged";
        }

        console.error(
            `Conflict: ${group.collection}/${item.id}`
        );

        console.error(
            `  Source: ${group.fileName}`
        );

        console.error(
            "  Existing canonical file differs from import data."
        );

        console.error(
            "  Refusing to overwrite canonical content."
        );

        return "conflict";

    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    await fs.writeFile(
        filePath,
        expectedContent,
        "utf8"
    );

    console.log(
        `Created:   ${group.collection}/${item.id}`
    );

    return "created";
}


/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function runValidator() {
    console.log(
        "\nRunning content validation...\n"
    );

    const result = spawnSync(
        process.execPath,
        [VALIDATOR],
        {
            cwd: ROOT_DIRECTORY,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    return result.status === 0;
}


/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
    console.log(
        "\nEngineering Reference — Import Content\n"
    );

    const groups =
        await loadImportFiles();

    let created = 0;
    let unchanged = 0;
    let conflicts = 0;

    for (const group of groups) {
        console.log(
            `Importing ${group.fileName}...`
        );

        for (const item of group.items) {
            const result =
                await importEntity(
                    group,
                    item
                );

            if (result === "created") {
                created += 1;
            }

            if (result === "unchanged") {
                unchanged += 1;
            }

            if (result === "conflict") {
                conflicts += 1;
            }
        }

        console.log("");
    }

    console.log(
        `Created ${created} entities.`
    );

    console.log(
        `Unchanged ${unchanged} entities.`
    );

    if (conflicts > 0) {
        console.error(
            `Conflicts ${conflicts} entities.`
        );

        console.error(
            "\nImport stopped because existing canonical " +
            "content would have been overwritten."
        );

        process.exitCode = 1;
        return;
    }

    const valid =
        runValidator();

    if (!valid) {
        console.error(
            "\nImport completed, but content validation failed."
        );

        process.exitCode = 1;
        return;
    }

    console.log(
        "\nImport completed successfully."
    );
}


main().catch((error) => {
    console.error(
        `\nImport failed: ${error.message}`
    );

    process.exitCode = 1;
});