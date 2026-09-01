export async function onRequest(context) {
    const { request, env, params } = context;

    if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", {
            status: 405
        });
    }

    const path = Array.isArray(params.path)
        ? params.path.join("/")
        : String(params.path || "");

    const objectKey = decodeURIComponent(path);

    if (!objectKey) {
        return new Response("Media Not Found", {
            status: 404
        });
    }

    try {
        const rangeHeader = request.headers.get("Range");

        let object;

        if (rangeHeader) {
            const match = rangeHeader.match(
                /^bytes=(\d+)-(\d*)$/
            );

            if (match) {
                const start = Number(match[1]);
                const end = match[2]
                    ? Number(match[2])
                    : undefined;

                if (
                    Number.isFinite(start) &&
                    (end === undefined ||
                     Number.isFinite(end)) &&
                    (end === undefined || end >= start)
                ) {
                    const range = {
                        offset: start
                    };

                    if (end !== undefined) {
                        range.length = end - start + 1;
                    }

                    object = await env.FLAYNITY_MEDIA.get(
                        objectKey,
                        { range }
                    );
                }
            }
        }

        if (!object) {
            object = await env.FLAYNITY_MEDIA.get(
                objectKey
            );
        }

        if (!object) {
            return new Response("Media Not Found", {
                status: 404
            });
        }

        const headers = new Headers();

        object.writeHttpMetadata(headers);

        headers.set(
            "Accept-Ranges",
            "bytes"
        );

        headers.set(
            "Cache-Control",
            "public, max-age=31536000, immutable"
        );

        headers.set(
            "ETag",
            object.httpEtag
        );

        if (object.range) {
            const start = object.range.offset;
            const length = object.range.length;
            const end = start + length - 1;

            headers.set(
                "Content-Range",
                `bytes ${start}-${end}/${object.size}`
            );

            headers.set(
                "Content-Length",
                String(length)
            );

            return new Response(
                request.method === "HEAD"
                    ? null
                    : object.body,
                {
                    status: 206,
                    headers
                }
            );
        }

        headers.set(
            "Content-Length",
            String(object.size)
        );

        return new Response(
            request.method === "HEAD"
                ? null
                : object.body,
            {
                status: 200,
                headers
            }
        );

    } catch (error) {
        return new Response(
            "Media Server Error",
            {
                status: 500
            }
        );
    }
}
