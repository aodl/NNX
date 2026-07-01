use candid::Principal;
use ic_asset_certification::{
    Asset, AssetCertificationError, AssetConfig, AssetEncoding, AssetFallbackConfig, AssetRouter,
};
use ic_cdk::{api::data_certificate, init, post_upgrade, query};
use ic_http_certification::{
    utils::add_v2_certificate_header, DefaultCelBuilder, DefaultResponseCertification, HeaderField,
    HttpCertification, HttpCertificationPath, HttpCertificationTree, HttpCertificationTreeEntry,
    HttpRequest, HttpResponse, Method, StatusCode, CERTIFICATE_EXPRESSION_HEADER_NAME,
};
use include_dir::{include_dir, Dir};
use std::{borrow::Cow, cell::RefCell, collections::HashMap, rc::Rc};

thread_local! {
    static HTTP_TREE: Rc<RefCell<HttpCertificationTree>> = Default::default();
    static ASSET_ROUTER: RefCell<AssetRouter<'static>> = RefCell::new(
        AssetRouter::with_tree(HTTP_TREE.with(|tree| tree.clone()))
    );
    static HEAD_ASSETS: RefCell<HashMap<HeadAssetKey, CertifiedHeadAsset>> = RefCell::new(HashMap::new());
    static NOT_FOUND_ASSETS: RefCell<HashMap<String, CertifiedHeadAsset>> = RefCell::new(HashMap::new());
}

static ASSETS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/public");

const PRIVATE_BUILD_MANIFEST_PATH: &str = "generated/frontend-bundle.json";
const PUBLIC_FRONTEND_ENV_PATH: &str = "generated/frontend-env.json";
const PUBLIC_BUILD_INFO_PATH: &str = "generated/build-info.json";
const PLACEHOLDER_BUNDLE_PATH: &str = "/generated/app.placeholder.js";
const IMMUTABLE_ASSET_CACHE_CONTROL: &str = "public, max-age=31536000, immutable";
const NO_CACHE_ASSET_CACHE_CONTROL: &str = "public, no-cache, no-store";
const HISTORIAN_ENV: &str = "PUBLIC_CANISTER_ID:nnx_historian";

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct HeadAssetKey {
    path: String,
    match_kind: HeadAssetMatchKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum HeadAssetMatchKind {
    Exact,
    Fallback,
}

#[derive(Debug, Clone)]
struct CertifiedHeadAsset {
    response: HttpResponse<'static>,
    tree_entry: HttpCertificationTreeEntry<'static>,
}

#[init]
fn init() {
    initialize_runtime_state();
}

#[post_upgrade]
fn post_upgrade() {
    initialize_runtime_state();
}

fn initialize_runtime_state() {
    certify_all_assets();
}

#[query]
fn http_request(req: HttpRequest) -> HttpResponse<'static> {
    if req.get_path().is_err() {
        return plain_error_response(StatusCode::BAD_REQUEST, "bad request path");
    }

    let Some(certificate) = data_certificate() else {
        return plain_error_response(StatusCode::INTERNAL_SERVER_ERROR, "certificate unavailable");
    };
    serve_asset_with_certificate(&certificate, &req)
}

fn collect_assets<'content, 'path>(
    dir: &'content Dir<'path>,
    assets: &mut Vec<Asset<'content, 'path>>,
) {
    for file in dir.files() {
        let path = file.path().to_string_lossy();
        if path != PRIVATE_BUILD_MANIFEST_PATH {
            let contents = if path == "index.html" {
                Cow::Owned(index_contents(dir, file.contents()))
            } else {
                Cow::Borrowed(file.contents())
            };
            assets.push(Asset::new(path, contents));
        }
    }

    for dir in dir.dirs() {
        collect_assets(dir, assets);
    }
}

fn index_contents(dir: &Dir<'_>, contents: &[u8]) -> Vec<u8> {
    let Some(bundle_path) = generated_bundle_path(dir) else {
        return contents.to_vec();
    };
    let index = String::from_utf8_lossy(contents);
    index
        .replace(PLACEHOLDER_BUNDLE_PATH, &format!("/{bundle_path}"))
        .into_bytes()
}

fn generated_bundle_path(dir: &Dir<'_>) -> Option<String> {
    let manifest = dir.get_file(PRIVATE_BUILD_MANIFEST_PATH)?;
    let manifest = std::str::from_utf8(manifest.contents()).ok()?;
    let bundle_path = json_string_field(manifest, "bundlePath")?;

    (bundle_path.starts_with("generated/app.") && bundle_path.ends_with(".js"))
        .then_some(bundle_path)
}

fn json_string_field(json: &str, field: &str) -> Option<String> {
    let key = format!("\"{field}\"");
    let mut rest = json.split_once(&key)?.1;
    rest = rest.split_once(':')?.1.trim_start();
    let rest = rest.strip_prefix('"')?;

    let mut value = String::new();
    let mut escaped = false;
    for char in rest.chars() {
        if escaped {
            value.push(char);
            escaped = false;
        } else if char == '\\' {
            escaped = true;
        } else if char == '"' {
            return Some(value);
        } else {
            value.push(char);
        }
    }
    None
}

#[cfg(not(test))]
fn update_certified_data(root_hash: &[u8]) {
    ic_cdk::api::certified_data_set(root_hash);
}

#[cfg(test)]
fn update_certified_data(root_hash: &[u8]) {
    let _ = root_hash;
}

fn certify_all_assets() {
    let compressed_encodings = vec![
        AssetEncoding::Brotli.default_config(),
        AssetEncoding::Gzip.default_config(),
    ];
    let mut asset_configs = vec![
        AssetConfig::File {
            path: "index.html".to_string(),
            content_type: Some("text/html".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![
                AssetFallbackConfig {
                    scope: "/neuron/".to_string(),
                    status_code: Some(StatusCode::OK),
                },
                AssetFallbackConfig {
                    scope: "/proposal/".to_string(),
                    status_code: Some(StatusCode::OK),
                },
                AssetFallbackConfig {
                    scope: "/subnet/".to_string(),
                    status_code: Some(StatusCode::OK),
                },
            ],
            aliased_by: vec![
                "/".to_string(),
                "/review".to_string(),
                "/data-sources".to_string(),
            ],
            encodings: compressed_encodings.clone(),
        },
        AssetConfig::File {
            path: "404.html".to_string(),
            content_type: Some("text/html".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![AssetFallbackConfig {
                scope: "/".to_string(),
                status_code: Some(StatusCode::NOT_FOUND),
            }],
            aliased_by: vec!["/404".to_string(), "/404.html".to_string()],
            encodings: compressed_encodings.clone(),
        },
        AssetConfig::File {
            path: ".well-known/ic-domains".to_string(),
            content_type: Some("text/plain".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![],
        },
        AssetConfig::File {
            path: "base.css".to_string(),
            content_type: Some("text/css".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![AssetEncoding::Gzip.default_config()],
        },
        AssetConfig::File {
            path: "logo.svg".to_string(),
            content_type: Some("image/svg+xml".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![AssetEncoding::Gzip.default_config()],
        },
        AssetConfig::File {
            path: "map/ne_110m_land.geojson".to_string(),
            content_type: Some("application/geo+json".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![AssetEncoding::Gzip.default_config()],
        },
        AssetConfig::File {
            path: PUBLIC_FRONTEND_ENV_PATH.to_string(),
            content_type: Some("application/json".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![AssetEncoding::Gzip.default_config()],
        },
        AssetConfig::File {
            path: PUBLIC_BUILD_INFO_PATH.to_string(),
            content_type: Some("application/json".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![AssetEncoding::Gzip.default_config()],
        },
        AssetConfig::Pattern {
            pattern: "**/*.css".to_string(),
            content_type: Some("text/css".to_string()),
            headers: asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL),
            encodings: vec![AssetEncoding::Gzip.default_config()],
        },
    ];

    let mut assets = Vec::new();
    collect_assets(&ASSETS_DIR, &mut assets);

    if let Some(generated_dir) = ASSETS_DIR.get_dir("generated") {
        for file in generated_dir.files() {
            let path = file.path().to_string_lossy();
            if !path.starts_with("generated/app.") || !path.ends_with(".js") {
                continue;
            }
            asset_configs.push(AssetConfig::File {
                path: path.to_string(),
                content_type: Some("text/javascript".to_string()),
                headers: asset_headers("same-origin", IMMUTABLE_ASSET_CACHE_CONTROL),
                fallback_for: vec![],
                aliased_by: vec![],
                encodings: compressed_encodings.clone(),
            });
        }
    }

    ASSET_ROUTER.with_borrow_mut(|asset_router| {
        if let Err(err) = asset_router.certify_assets(assets, asset_configs) {
            ic_cdk::trap(format!("failed to certify frontend assets: {err}"));
        }
        update_certified_data(&asset_router.root_hash());
    });

    if let Err(err) = certify_head_assets(&ASSETS_DIR) {
        ic_cdk::trap(format!("failed to certify frontend HEAD assets: {err}"));
    }
    if let Err(err) = certify_not_found_assets(&ASSETS_DIR) {
        ic_cdk::trap(format!("failed to certify frontend 404 assets: {err}"));
    }

    HTTP_TREE.with(|tree| update_certified_data(&tree.borrow().root_hash()));
}

fn certify_head_assets(dir: &Dir<'static>) -> Result<(), String> {
    let mut head_assets = HashMap::new();
    let index = dir
        .get_file("index.html")
        .ok_or_else(|| "index.html is missing from frontend assets".to_string())?;
    let not_found = dir
        .get_file("404.html")
        .ok_or_else(|| "404.html is missing from frontend assets".to_string())?;
    let base_css = dir
        .get_file("base.css")
        .ok_or_else(|| "base.css is missing from frontend assets".to_string())?;
    let logo_svg = dir
        .get_file("logo.svg")
        .ok_or_else(|| "logo.svg is missing from frontend assets".to_string())?;
    let land_geojson = dir
        .get_file("map/ne_110m_land.geojson")
        .ok_or_else(|| "map/ne_110m_land.geojson is missing from frontend assets".to_string())?;
    let ic_domains = dir
        .get_file(".well-known/ic-domains")
        .ok_or_else(|| ".well-known/ic-domains is missing from frontend assets".to_string())?;
    let index_content_length = index_contents(dir, index.contents()).len();

    insert_head_asset(
        &mut head_assets,
        "/",
        StatusCode::OK,
        headers_for_path("index.html", index_content_length),
        HeadAssetMatchKind::Exact,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/neuron/",
        StatusCode::OK,
        headers_for_path("index.html", index_content_length),
        HeadAssetMatchKind::Fallback,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/proposal/",
        StatusCode::OK,
        headers_for_path("index.html", index_content_length),
        HeadAssetMatchKind::Fallback,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/subnet/",
        StatusCode::OK,
        headers_for_path("index.html", index_content_length),
        HeadAssetMatchKind::Fallback,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/review",
        StatusCode::OK,
        headers_for_path("index.html", index_content_length),
        HeadAssetMatchKind::Exact,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/data-sources",
        StatusCode::OK,
        headers_for_path("index.html", index_content_length),
        HeadAssetMatchKind::Exact,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/base.css",
        StatusCode::OK,
        headers_for_path("base.css", base_css.contents().len()),
        HeadAssetMatchKind::Exact,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/logo.svg",
        StatusCode::OK,
        headers_for_path("logo.svg", logo_svg.contents().len()),
        HeadAssetMatchKind::Exact,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/map/ne_110m_land.geojson",
        StatusCode::OK,
        headers_for_path("map/ne_110m_land.geojson", land_geojson.contents().len()),
        HeadAssetMatchKind::Exact,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/.well-known/ic-domains",
        StatusCode::OK,
        headers_for_path(".well-known/ic-domains", ic_domains.contents().len()),
        HeadAssetMatchKind::Exact,
    )?;
    for path in [PUBLIC_FRONTEND_ENV_PATH, PUBLIC_BUILD_INFO_PATH] {
        if let Some(file) = dir.get_file(path) {
            insert_head_asset(
                &mut head_assets,
                &format!("/{path}"),
                StatusCode::OK,
                headers_for_path(path, file.contents().len()),
                HeadAssetMatchKind::Exact,
            )?;
        }
    }
    insert_head_asset(
        &mut head_assets,
        "/404",
        StatusCode::OK,
        headers_for_path("404.html", not_found.contents().len()),
        HeadAssetMatchKind::Exact,
    )?;
    insert_head_asset(
        &mut head_assets,
        "/404.html",
        StatusCode::OK,
        headers_for_path("404.html", not_found.contents().len()),
        HeadAssetMatchKind::Exact,
    )?;

    if let Some(generated_dir) = dir.get_dir("generated") {
        for file in generated_dir.files() {
            let path = file.path().to_string_lossy();
            if path.starts_with("generated/app.") && path.ends_with(".js") {
                insert_head_asset(
                    &mut head_assets,
                    &format!("/{path}"),
                    StatusCode::OK,
                    headers_for_path(&path, file.contents().len()),
                    HeadAssetMatchKind::Exact,
                )?;
            }
        }
    }

    insert_head_asset(
        &mut head_assets,
        "/",
        StatusCode::NOT_FOUND,
        headers_for_path("404.html", not_found.contents().len()),
        HeadAssetMatchKind::Fallback,
    )?;

    HEAD_ASSETS.with(|stored| *stored.borrow_mut() = head_assets);
    Ok(())
}

fn certify_not_found_assets(dir: &Dir<'static>) -> Result<(), String> {
    let not_found = dir
        .get_file("404.html")
        .ok_or_else(|| "404.html is missing from frontend assets".to_string())?;
    let mut assets = HashMap::new();
    for scope in [
        "/neuron/",
        "/proposal/",
        "/subnet/",
        "/review/",
        "/data-sources/",
    ] {
        insert_not_found_asset(
            &mut assets,
            scope,
            not_found.contents().to_vec(),
            headers_for_path("404.html", not_found.contents().len()),
        )?;
    }
    NOT_FOUND_ASSETS.with(|stored| *stored.borrow_mut() = assets);
    Ok(())
}

fn insert_head_asset(
    head_assets: &mut HashMap<HeadAssetKey, CertifiedHeadAsset>,
    path: &str,
    status_code: StatusCode,
    headers: Vec<HeaderField>,
    match_kind: HeadAssetMatchKind,
) -> Result<(), String> {
    let response = HttpResponse::builder()
        .with_status_code(status_code)
        .with_body(Vec::new())
        .with_headers(headers)
        .build();
    let request = HttpRequest::builder()
        .with_method(Method::HEAD)
        .with_url(path)
        .build();
    let cel_expr = DefaultCelBuilder::full_certification()
        .with_response_certification(DefaultResponseCertification::response_header_exclusions(
            vec![],
        ))
        .build();
    let certification = HttpCertification::full(&cel_expr, &request, &response, None)
        .map_err(|err| err.to_string())?;
    let certification_path = match match_kind {
        HeadAssetMatchKind::Exact => HttpCertificationPath::exact(path.to_string()),
        HeadAssetMatchKind::Fallback => HttpCertificationPath::wildcard(path.to_string()),
    };
    let tree_entry = HttpCertificationTreeEntry::new(certification_path, certification);

    HTTP_TREE.with(|tree| tree.borrow_mut().insert(&tree_entry));
    head_assets.insert(
        HeadAssetKey {
            path: path.to_string(),
            match_kind,
        },
        CertifiedHeadAsset {
            response,
            tree_entry,
        },
    );
    Ok(())
}

fn insert_not_found_asset(
    not_found_assets: &mut HashMap<String, CertifiedHeadAsset>,
    scope: &str,
    body: Vec<u8>,
    headers: Vec<HeaderField>,
) -> Result<(), String> {
    let response = HttpResponse::builder()
        .with_status_code(StatusCode::NOT_FOUND)
        .with_body(body)
        .with_headers(headers)
        .build();
    let request = HttpRequest::builder()
        .with_method(Method::GET)
        .with_url(scope)
        .build();
    let cel_expr = DefaultCelBuilder::full_certification()
        .with_response_certification(DefaultResponseCertification::response_header_exclusions(
            vec![],
        ))
        .build();
    let certification = HttpCertification::full(&cel_expr, &request, &response, None)
        .map_err(|err| err.to_string())?;
    let tree_entry = HttpCertificationTreeEntry::new(
        HttpCertificationPath::wildcard(scope.to_string()),
        certification,
    );

    HTTP_TREE.with(|tree| tree.borrow_mut().insert(&tree_entry));
    not_found_assets.insert(
        scope.to_string(),
        CertifiedHeadAsset {
            response,
            tree_entry,
        },
    );
    Ok(())
}

fn serve_asset_with_certificate(certificate: &[u8], req: &HttpRequest) -> HttpResponse<'static> {
    let path = match req.get_path() {
        Ok(path) => path,
        Err(err) => return asset_error_response(&AssetCertificationError::from(err)),
    };

    if !is_public_route(&path) {
        return not_found_response(certificate, req);
    }

    if req.method() == Method::HEAD {
        return serve_head_asset(certificate, req);
    }

    ASSET_ROUTER.with_borrow(
        |asset_router| match asset_router.serve_asset(certificate, req) {
            Ok(response) => response,
            Err(err) => asset_error_response(&err),
        },
    )
}

fn serve_head_asset(certificate: &[u8], req: &HttpRequest) -> HttpResponse<'static> {
    let path = match req.get_path() {
        Ok(path) => path,
        Err(err) => return asset_error_response(&AssetCertificationError::from(err)),
    };

    HEAD_ASSETS.with_borrow(
        |head_assets| match find_head_asset(head_assets, &path).cloned() {
            Some(mut asset) => {
                let witness = HTTP_TREE.with(|tree| {
                    tree.borrow()
                        .witness(&asset.tree_entry, &path)
                        .map_err(AssetCertificationError::from)
                });
                match witness {
                    Ok(witness) => {
                        add_v2_certificate_header(
                            certificate,
                            &mut asset.response,
                            &witness,
                            &asset.tree_entry.path.to_expr_path(),
                        );
                        asset.response
                    }
                    Err(err) => asset_error_response(&err),
                }
            }
            None => not_found_response(certificate, req),
        },
    )
}

fn find_head_asset<'a>(
    head_assets: &'a HashMap<HeadAssetKey, CertifiedHeadAsset>,
    path: &str,
) -> Option<&'a CertifiedHeadAsset> {
    if let Some(asset) = head_assets.get(&HeadAssetKey {
        path: path.to_string(),
        match_kind: HeadAssetMatchKind::Exact,
    }) {
        return Some(asset);
    }

    let mut scopes = path.split('/').collect::<Vec<_>>();
    scopes.pop();
    while !scopes.is_empty() {
        let mut scope = scopes.join("/");
        scope.push('/');
        if let Some(asset) = head_assets.get(&HeadAssetKey {
            path: scope.clone(),
            match_kind: HeadAssetMatchKind::Fallback,
        }) {
            return Some(asset);
        }
        if let Some(asset) = head_assets.get(&HeadAssetKey {
            path: scope.trim_end_matches('/').to_string(),
            match_kind: HeadAssetMatchKind::Fallback,
        }) {
            return Some(asset);
        }
        scopes.pop();
    }
    None
}

fn is_public_route(path: &str) -> bool {
    if path == "/generated/frontend-bundle.json" {
        return false;
    }
    if path == "/" || path == "/missing" || path == "/review" || path == "/data-sources" {
        return true;
    }
    if path == "/base.css" || path == "/logo.svg" || path == "/404" || path == "/404.html" {
        return true;
    }
    if path == "/map/ne_110m_land.geojson" {
        return true;
    }
    if path == "/.well-known/ic-domains" {
        return true;
    }
    if path.starts_with("/generated/app.") && path.ends_with(".js") {
        return true;
    }
    if path == "/generated/frontend-env.json" || path == "/generated/build-info.json" {
        return true;
    }
    is_valid_id_route(path, "/neuron/")
        || is_valid_id_route(path, "/proposal/")
        || is_valid_principal_route(path, "/subnet/")
}

fn is_valid_id_route(path: &str, prefix: &str) -> bool {
    let Some(id) = path.strip_prefix(prefix) else {
        return false;
    };
    if id.is_empty() || id.contains('/') || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return false;
    }
    id.parse::<u64>().is_ok()
}

fn is_valid_principal_route(path: &str, prefix: &str) -> bool {
    let Some(id) = path.strip_prefix(prefix) else {
        return false;
    };
    !id.is_empty() && !id.contains('/') && Principal::from_text(id).is_ok()
}

fn not_found_response(certificate: &[u8], req: &HttpRequest) -> HttpResponse<'static> {
    if req.method() == Method::HEAD {
        return serve_head_not_found(certificate, req);
    }

    if let Some(response) = serve_scoped_not_found(certificate, req) {
        return response;
    }

    let fallback_req = HttpRequest::get("/missing").build();
    ASSET_ROUTER.with_borrow(|asset_router| {
        match asset_router.serve_asset(certificate, &fallback_req) {
            Ok(response) => response,
            Err(err) => asset_error_response(&err),
        }
    })
}

fn serve_scoped_not_found(certificate: &[u8], req: &HttpRequest) -> Option<HttpResponse<'static>> {
    let path = req.get_path().ok()?;
    NOT_FOUND_ASSETS.with_borrow(|not_found_assets| {
        for scope in [
            "/subnet/",
            "/proposal/",
            "/neuron/",
            "/review/",
            "/data-sources/",
        ] {
            if !path.starts_with(scope) {
                continue;
            }
            let mut asset = not_found_assets.get(scope)?.clone();
            let witness = HTTP_TREE.with(|tree| {
                tree.borrow()
                    .witness(&asset.tree_entry, &path)
                    .map_err(AssetCertificationError::from)
            });
            match witness {
                Ok(witness) => {
                    add_v2_certificate_header(
                        certificate,
                        &mut asset.response,
                        &witness,
                        &asset.tree_entry.path.to_expr_path(),
                    );
                    return Some(asset.response);
                }
                Err(err) => return Some(asset_error_response(&err)),
            }
        }
        None
    })
}

fn serve_head_not_found(certificate: &[u8], req: &HttpRequest) -> HttpResponse<'static> {
    let path = match req.get_path() {
        Ok(path) => path,
        Err(err) => return asset_error_response(&AssetCertificationError::from(err)),
    };

    HEAD_ASSETS.with_borrow(|head_assets| {
        match head_assets
            .get(&HeadAssetKey {
                path: "/".to_string(),
                match_kind: HeadAssetMatchKind::Fallback,
            })
            .cloned()
        {
            Some(mut asset) => {
                let witness = HTTP_TREE.with(|tree| {
                    tree.borrow()
                        .witness(&asset.tree_entry, &path)
                        .map_err(AssetCertificationError::from)
                });
                match witness {
                    Ok(witness) => {
                        add_v2_certificate_header(
                            certificate,
                            &mut asset.response,
                            &witness,
                            &asset.tree_entry.path.to_expr_path(),
                        );
                        asset.response
                    }
                    Err(err) => asset_error_response(&err),
                }
            }
            None => plain_error_response(StatusCode::NOT_FOUND, "not found"),
        }
    })
}

fn asset_error_response(err: &AssetCertificationError) -> HttpResponse<'static> {
    match err {
        AssetCertificationError::NoAssetMatchingRequestUrl { .. } => {
            plain_error_response(StatusCode::NOT_FOUND, "not found")
        }
        _ => plain_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to serve frontend asset",
        ),
    }
}

fn plain_error_response(status: StatusCode, message: &str) -> HttpResponse<'static> {
    HttpResponse::builder()
        .with_status_code(status)
        .with_body(message.as_bytes().to_vec())
        .with_headers({
            let mut headers = asset_headers("same-origin", NO_CACHE_ASSET_CACHE_CONTROL);
            headers.push((
                "content-type".to_string(),
                "text/plain; charset=utf-8".to_string(),
            ));
            headers
        })
        .build()
}

fn headers_for_path(path: &str, content_length: usize) -> Vec<HeaderField> {
    let mut headers = asset_headers(
        "same-origin",
        if path == "index.html"
            || path == "404.html"
            || path == "base.css"
            || path == "logo.svg"
            || path == ".well-known/ic-domains"
            || path == "map/ne_110m_land.geojson"
            || path == PUBLIC_FRONTEND_ENV_PATH
            || path == PUBLIC_BUILD_INFO_PATH
        {
            NO_CACHE_ASSET_CACHE_CONTROL
        } else {
            IMMUTABLE_ASSET_CACHE_CONTROL
        },
    );
    headers.push(("content-length".to_string(), content_length.to_string()));
    headers.push((
        "content-type".to_string(),
        match path {
            "index.html" | "404.html" => "text/html",
            "logo.svg" => "image/svg+xml",
            ".well-known/ic-domains" => "text/plain",
            "map/ne_110m_land.geojson" => "application/geo+json",
            "generated/frontend-env.json" | "generated/build-info.json" => "application/json",
            _ if path.ends_with(".js") => "text/javascript",
            _ if path.ends_with(".css") => "text/css",
            _ => "application/octet-stream",
        }
        .to_string(),
    ));
    if matches!(path, "index.html" | "404.html") {
        if let Some(cookie) = ic_env_cookie_header() {
            headers.push(cookie);
        }
    }
    headers.push((
        CERTIFICATE_EXPRESSION_HEADER_NAME.to_string(),
        DefaultCelBuilder::full_certification()
            .with_response_certification(DefaultResponseCertification::response_header_exclusions(
                vec![],
            ))
            .build()
            .to_string(),
    ));
    headers
}

#[cfg(not(test))]
fn canister_env_value(name: &str) -> Option<String> {
    if !ic_cdk::api::env_var_name_exists(name) {
        return None;
    }
    let value = ic_cdk::api::env_var_value(name);
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
fn canister_env_value(_name: &str) -> Option<String> {
    None
}

fn ic_env_cookie_header() -> Option<HeaderField> {
    let proxy_id = canister_env_value(HISTORIAN_ENV)?;
    let mut values = Vec::new();
    if let Some(root_key) = canister_env_value("IC_ROOT_KEY") {
        values.push(format!("ic_root_key={root_key}"));
    }
    values.push(format!("{HISTORIAN_ENV}={proxy_id}"));
    Some((
        "set-cookie".to_string(),
        format!("ic_env={}; Path=/; SameSite=Strict", values.join("&")),
    ))
}

fn asset_headers(corp: &str, cache_control: &str) -> Vec<HeaderField> {
    vec![
        (
            "strict-transport-security".to_string(),
            "max-age=31536000; includeSubDomains".to_string(),
        ),
        ("x-content-type-options".to_string(), "nosniff".to_string()),
        (
            "content-security-policy".to_string(),
            "default-src 'self'; connect-src 'self' https://icp0.io https://*.icp0.io; base-uri 'self'; script-src 'self'; img-src 'self' data:; style-src 'self'; style-src-attr 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; manifest-src 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'self'; upgrade-insecure-requests".to_string(),
        ),
        ("referrer-policy".to_string(), "no-referrer".to_string()),
        (
            "permissions-policy".to_string(),
            "accelerometer=(),autoplay=(),camera=(),display-capture=(),geolocation=(),gyroscope=(),magnetometer=(),microphone=(),midi=(),payment=(),picture-in-picture=(),publickey-credentials-get=(),screen-wake-lock=(),usb=(),web-share=(),xr-spatial-tracking=()".to_string(),
        ),
        (
            "cross-origin-embedder-policy".to_string(),
            "require-corp".to_string(),
        ),
        (
            "cross-origin-opener-policy".to_string(),
            "same-origin".to_string(),
        ),
        (
            "cross-origin-resource-policy".to_string(),
            corp.to_string(),
        ),
        ("cache-control".to_string(), cache_control.to_string()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header_value<'a>(response: &'a HttpResponse<'static>, name: &str) -> Option<&'a str> {
        response
            .headers()
            .iter()
            .find(|(header, _)| header.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    fn content_length(response: &HttpResponse<'static>) -> usize {
        header_value(response, "content-length")
            .expect("response should include content-length")
            .parse()
            .expect("content-length should be numeric")
    }

    fn get(path: &str) -> HttpResponse<'static> {
        certify_all_assets();
        serve_asset_with_certificate(b"test-certificate", &HttpRequest::get(path).build())
    }

    fn head(path: &str) -> HttpResponse<'static> {
        certify_all_assets();
        serve_asset_with_certificate(
            b"test-certificate",
            &HttpRequest::builder()
                .with_method(Method::HEAD)
                .with_url(path)
                .build(),
        )
    }

    fn generated_app_path() -> Option<String> {
        ASSETS_DIR.get_dir("generated").and_then(|generated_dir| {
            generated_dir.files().find_map(|file| {
                let path = file.path().to_string_lossy();
                (path.starts_with("generated/app.") && path.ends_with(".js"))
                    .then(|| format!("/{path}"))
            })
        })
    }

    #[test]
    fn root_route_stamps_index_with_generated_bundle_path() {
        let Some(js_path) = generated_app_path() else {
            return;
        };
        let response = get("/");
        let body = String::from_utf8_lossy(response.body());
        assert!(body.contains(&format!("src=\"{js_path}\"")));
        assert!(!body.contains(PLACEHOLDER_BUNDLE_PATH));
    }

    #[test]
    fn root_route_returns_index_with_200() {
        let response = get("/");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
        assert!(String::from_utf8_lossy(response.body()).contains("Network Nexus"));
    }

    #[test]
    fn head_root_route_returns_index_metadata_with_200() {
        let response = head("/");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert!(response.body().is_empty());
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
    }

    #[test]
    fn head_index_routes_match_stamped_get_body_length_when_manifest_exists() {
        if generated_bundle_path(&ASSETS_DIR).is_none() {
            return;
        }

        for path in [
            "/",
            "/neuron/2947465672511369",
            "/proposal/2947465672511369",
            "/subnet/uuc56-gyb",
            "/review",
            "/data-sources",
        ] {
            let get_response = get(path);
            let head_response = head(path);

            assert_eq!(get_response.status_code(), StatusCode::OK);
            assert_eq!(head_response.status_code(), StatusCode::OK);
            assert!(head_response.body().is_empty());
            assert_eq!(content_length(&head_response), get_response.body().len());
        }
    }

    #[test]
    fn neuron_route_returns_index_with_200() {
        let response = get("/neuron/2947465672511369");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
        assert!(String::from_utf8_lossy(response.body()).contains("Network Nexus"));
    }

    #[test]
    fn proposal_route_returns_index_with_200() {
        let response = get("/proposal/2947465672511369");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
        assert!(String::from_utf8_lossy(response.body()).contains("Network Nexus"));
    }

    #[test]
    fn subnet_route_returns_index_with_200() {
        let response = get("/subnet/uuc56-gyb");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
        assert!(String::from_utf8_lossy(response.body()).contains("Network Nexus"));
    }

    #[test]
    fn review_route_returns_index_with_200() {
        let response = get("/review");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
        assert!(String::from_utf8_lossy(response.body()).contains("Network Nexus"));
    }

    #[test]
    fn data_sources_route_returns_index_with_200() {
        let response = get("/data-sources");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
        assert!(String::from_utf8_lossy(response.body()).contains("Network Nexus"));
    }

    #[test]
    fn malformed_neuron_route_returns_404() {
        assert_eq!(
            get("/neuron/not-a-number").status_code(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            get("/neuron/123/extra").status_code(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn malformed_proposal_route_returns_404() {
        assert_eq!(
            get("/proposal/not-a-number").status_code(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            get("/proposal/123/extra").status_code(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn malformed_subnet_route_returns_404() {
        assert_eq!(
            get("/subnet/not-a-principal").status_code(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            get("/subnet/uuc56-gyb/extra").status_code(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn malformed_static_spa_routes_return_404() {
        assert_eq!(get("/review/extra").status_code(), StatusCode::NOT_FOUND);
        assert_eq!(
            get("/data-sources/extra").status_code(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn missing_returns_404() {
        assert_eq!(get("/missing").status_code(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn head_invalid_routes_return_404() {
        let unknown = head("/unknown");
        assert_eq!(unknown.status_code(), StatusCode::NOT_FOUND);
        assert!(unknown.body().is_empty());

        let malformed_neuron = head("/neuron/not-a-number");
        assert_eq!(malformed_neuron.status_code(), StatusCode::NOT_FOUND);
        assert!(malformed_neuron.body().is_empty());

        let malformed_proposal = head("/proposal/not-a-number");
        assert_eq!(malformed_proposal.status_code(), StatusCode::NOT_FOUND);
        assert!(malformed_proposal.body().is_empty());

        let malformed_subnet = head("/subnet/not-a-principal");
        assert_eq!(malformed_subnet.status_code(), StatusCode::NOT_FOUND);
        assert!(malformed_subnet.body().is_empty());
    }

    #[test]
    fn generated_manifest_is_not_served() {
        assert_eq!(
            get("/generated/frontend-bundle.json").status_code(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn generated_js_uses_immutable_cache_headers() {
        let Some(js_path) = generated_app_path() else {
            return;
        };
        certify_all_assets();
        let response =
            serve_asset_with_certificate(b"test-certificate", &HttpRequest::get(js_path).build());
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(IMMUTABLE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn generated_build_info_is_public_no_cache_json_when_built() {
        if ASSETS_DIR.get_file(PUBLIC_BUILD_INFO_PATH).is_none() {
            return;
        }
        let response = get("/generated/build-info.json");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(
            header_value(&response, "content-type"),
            Some("application/json")
        );
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn head_generated_build_info_is_exactly_certified_when_built() {
        if ASSETS_DIR.get_file(PUBLIC_BUILD_INFO_PATH).is_none() {
            return;
        }
        let response = head("/generated/build-info.json");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert!(response.body().is_empty());
        assert_eq!(
            header_value(&response, "content-type"),
            Some("application/json")
        );
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn land_geojson_asset_is_served_with_no_cache_headers() {
        let response = get("/map/ne_110m_land.geojson");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(
            header_value(&response, "content-type"),
            Some("application/geo+json")
        );
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn index_and_404_use_no_cache_headers() {
        let index = get("/neuron/1");
        assert_eq!(
            header_value(&index, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
        let not_found = get("/missing");
        assert_eq!(
            header_value(&not_found, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn head_base_css_is_exactly_certified() {
        let response = head("/base.css");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert!(response.body().is_empty());
        assert_eq!(header_value(&response, "content-type"), Some("text/css"));
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn logo_svg_asset_is_served_with_no_cache_headers() {
        let response = get("/logo.svg");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert_eq!(
            header_value(&response, "content-type"),
            Some("image/svg+xml")
        );
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
        assert!(String::from_utf8_lossy(response.body()).contains("Network Nexus logo"));
    }

    #[test]
    fn head_ic_domains_is_exactly_certified() {
        let response = head("/.well-known/ic-domains");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert!(response.body().is_empty());
        assert_eq!(header_value(&response, "content-type"), Some("text/plain"));
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn head_generated_js_is_exactly_certified_when_built() {
        let Some(js_path) = generated_app_path() else {
            return;
        };
        let response = head(&js_path);
        assert_eq!(response.status_code(), StatusCode::OK);
        assert!(response.body().is_empty());
        assert_eq!(
            header_value(&response, "content-type"),
            Some("text/javascript")
        );
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(IMMUTABLE_ASSET_CACHE_CONTROL)
        );
    }

    #[test]
    fn head_land_geojson_is_exactly_certified() {
        let response = head("/map/ne_110m_land.geojson");
        assert_eq!(response.status_code(), StatusCode::OK);
        assert!(response.body().is_empty());
        assert_eq!(
            header_value(&response, "content-type"),
            Some("application/geo+json")
        );
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(NO_CACHE_ASSET_CACHE_CONTROL)
        );
    }
}
