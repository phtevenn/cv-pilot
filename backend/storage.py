import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config import RESUMES_DIR

SAMPLE_RESUME = """\
**STEPHEN YU**

Mountain View, CA • 970-297-8699 • yu.m.stephen@gmail.com •
linkedin.com/in/stephen-yu-b844b5144 • https://github.com/phtevenn

Scientist with 8+ years in protein biochemistry and drug discovery, utilizing computational skills to drive data analysis and bioinformatics insights across immuno-oncology and small molecule research

**WORK EXPERIENCE**

**Gate Bioscience** • **02/2023 - Present**

**Scientist**

* Developed and operated an in-house RNA-Seq analysis pipeline (Nextflow on AWS ParallelCluster), later migrated to AWS HealthOmics for fully managed execution
* Analyzed transcriptomic effects of SEC61 inhibition across multiple cell lines and tissues, uncovering mechanistic insights into stress-response pathways, apoptosis, and factors affecting therapeutic index
* Identified a key biomarker of SEC61-induced stress to monitor stress induction in vitro and in vivo
* Leveraged public scRNA-Seq datasets to map pathway activation signatures and compare Gate's molecules to standard of care biologics
* Used TRUST4 to assemble expressed light-chain sequences from bulk RNA-Seq data
* Built a reproducible pipeline to generate cross-species SEC61 client databases by integrating UniProt, ENSEMBL, OMA, SignalP, and Phobius annotations for any target species
* Trained machine-learning models to predict SEC61 inhibitor off-targets and applied SHAP analysis to identify signal-peptide features driving selective inhibition
* Collaborated with wet-lab and engineering teams to design experiments and deploy analysis pipelines

**Harpoon Therapeutics** • **09/2017 - 11/2022**

**Senior Research Associate**

* Supported T-cell engager platforms (TriTAC / ProTriTAC) through affinity characterization, species cross-reactivity studies, epitope binning, and binder screening
* Authored IND-enabling kinetics and binding study reports for advanced T-cell engager programs, including affinity, cross-reactivity, and epitope characterization packages used in regulatory submissions
* Automated lab workflows via custom Tecan Fluent scripts; developed Benchling dashboards for experiment tracking and reagent management
* Screened up to thousands of binders weekly to support antibody engineering campaigns
* Developed and optimized SPR/BLI assays for affinity, kinetics, and titer quantification of engineered antibodies and fusion proteins
* Designed mammalian expression workflows and optimized processes to improve expression of difficult-to-express proteins by ~50-fold

**SKILLS**

**Computational Tools & ML:** Bash, Python, SQL, R

**Bioinformatics:** Bulk and single-cell RNA-Seq, WES, variant calling, immune repertoire profiling

**Infrastructure:** AWS, Docker / Singularity, Git, Linux, Slurm

**Wet Lab:** Assay development, Cell culture, CRISPR, ELISA, flow cytometry, HTRF, lentiviral transduction, MSD, SPR/BLI, transfection, Western blots

**PROJECTS**

**Agent Swarm: https://github.com/phtevenn/agent-swarm**

Orchestration framework to allow multiple coding agents (Claude Code, Codex, Gemini) to cooperate. Agent Swarm allows a lead agent to accept tasks from a human, breaks them down, and delegates subtasks to worker agents running in parallel. Built in TypeScript + Ink.

**Benchling Agent: https://github.com/phtevenn/benchling-agent**

An AI agent that allows the user to converse with AI, plan an experiment and then write a Benchling entry for the user based on the experiment plans. Built in Python utilizing browser automation.

**Lunar Lander: https://github.com/phtevenn/LunarLander-v2**

Implemented a Deep-Q network to solve Lunar Lander V2 from OpenAI gym from scratch, utilizing reinforcement learning.

**EDUCATION**

**Masters of Science, Analytics in Computational Data Analytics**

GEORGIA INSTITUTE OF TECHNOLOGY • 01/2023

**Bachelors of Science in Biochemistry**

UNIVERSITY OF CALIFORNIA LOS ANGELES • 01/2017

**PUBLICATIONS**

Antonia R, Yu S, et al. Inhibition of the Sec61 translocon promotes immunoglobulin light chain-dependent cell stress and apoptosis: therapeutic implications for AL amyloidosis. Blood. 144(Suppl 1):6862. doi:10.1182/blood-2024-198698

Molloy ME, Aaron WH, Barath M, et al. HPN328, a trispecific T cell-activating protein construct targeting DLL3-expressing solid tumors. Mol Cancer Ther. 23(9):1294-1304. doi:10.1158/1535-7163.MCT-23-0524.

Austin RJ, Lemon BD, Aaron WH, et al. TriTACs, a novel class of T-cell-engaging protein constructs designed for the treatment of solid tumors. Mol Cancer Ther. 20(1):109-120. doi:10.1158/1535-7163.MCT-20-0061
"""

DEFAULT_VERSION_NAME = "Base"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _user_dir(user_id: str) -> Path:
    d = RESUMES_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _manifest_path(user_id: str) -> Path:
    return _user_dir(user_id) / "manifest.json"


def _version_path(user_id: str, version_id: str) -> Path:
    return _user_dir(user_id) / f"{version_id}.md"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_manifest(user_id: str) -> dict:
    path = _manifest_path(user_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"active_version_id": None, "versions": []}


def _save_manifest(user_id: str, manifest: dict) -> None:
    _manifest_path(user_id).write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _create_version_internal(user_id: str, name: str, content: str) -> dict:
    manifest = _load_manifest(user_id)
    vid = str(uuid.uuid4())
    now = _now()
    meta: dict = {"id": vid, "name": name, "created_at": now, "updated_at": now}
    manifest["versions"].append(meta)
    if manifest["active_version_id"] is None:
        manifest["active_version_id"] = vid
    _save_manifest(user_id, manifest)
    _version_path(user_id, vid).write_text(content, encoding="utf-8")
    return meta


def _migrate_legacy(user_id: str) -> None:
    """Migrate old flat {user_id}.md file to the versioned directory layout."""
    legacy = RESUMES_DIR / f"{user_id}.md"
    if legacy.exists() and not _manifest_path(user_id).exists():
        content = legacy.read_text(encoding="utf-8")
        _create_version_internal(user_id, DEFAULT_VERSION_NAME, content)
        legacy.unlink()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def init_user(user_id: str) -> None:
    """Ensure a user has at least one version, seeding with the sample if new."""
    _migrate_legacy(user_id)
    manifest = _load_manifest(user_id)
    if not manifest["versions"]:
        _create_version_internal(user_id, DEFAULT_VERSION_NAME, SAMPLE_RESUME)


def list_versions(user_id: str) -> list[dict]:
    init_user(user_id)
    manifest = _load_manifest(user_id)
    active_id = manifest["active_version_id"]
    return [{**v, "is_active": v["id"] == active_id} for v in manifest["versions"]]


def create_version(user_id: str, name: str, content: str) -> dict:
    init_user(user_id)
    return _create_version_internal(user_id, name, content)


def load_version(user_id: str, version_id: str) -> Optional[str]:
    path = _version_path(user_id, version_id)
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def save_version(
    user_id: str,
    version_id: str,
    content: Optional[str] = None,
    new_name: Optional[str] = None,
) -> Optional[dict]:
    """Update content and/or name of a version. Returns updated metadata or None if not found."""
    manifest = _load_manifest(user_id)
    for v in manifest["versions"]:
        if v["id"] == version_id:
            v["updated_at"] = _now()
            if new_name is not None:
                v["name"] = new_name
            _save_manifest(user_id, manifest)
            if content is not None:
                _version_path(user_id, version_id).write_text(content, encoding="utf-8")
            return dict(v)
    return None


def delete_version(user_id: str, version_id: str) -> bool:
    """Delete a version. Returns False (and does nothing) if it's the last one."""
    manifest = _load_manifest(user_id)
    versions = manifest["versions"]
    if len(versions) <= 1:
        return False
    manifest["versions"] = [v for v in versions if v["id"] != version_id]
    if manifest["active_version_id"] == version_id:
        manifest["active_version_id"] = manifest["versions"][0]["id"]
    _save_manifest(user_id, manifest)
    path = _version_path(user_id, version_id)
    if path.exists():
        path.unlink()
    return True


def get_active_version_id(user_id: str) -> Optional[str]:
    init_user(user_id)
    return _load_manifest(user_id)["active_version_id"]


def set_active_version(user_id: str, version_id: str) -> bool:
    manifest = _load_manifest(user_id)
    ids = {v["id"] for v in manifest["versions"]}
    if version_id not in ids:
        return False
    manifest["active_version_id"] = version_id
    _save_manifest(user_id, manifest)
    return True


# ---------------------------------------------------------------------------
# Application tracker storage
# ---------------------------------------------------------------------------


def _applications_path(user_id: str) -> Path:
    return _user_dir(user_id) / "applications.json"


def _load_applications(user_id: str) -> list[dict]:
    path = _applications_path(user_id)
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _save_applications(user_id: str, applications: list[dict]) -> None:
    _applications_path(user_id).write_text(json.dumps(applications, indent=2), encoding="utf-8")


def list_applications(user_id: str) -> list[dict]:
    _user_dir(user_id)  # ensure dir exists
    return _load_applications(user_id)


def create_application(user_id: str, data: dict) -> dict:
    applications = _load_applications(user_id)
    now = _now()
    app: dict = {
        "id": str(uuid.uuid4()),
        "job_title": data.get("job_title", ""),
        "company": data.get("company", ""),
        "location": data.get("location", ""),
        "status": data.get("status", "applied"),
        "version_id": data.get("version_id"),
        "version_name": data.get("version_name"),
        "job_url": data.get("job_url", ""),
        "notes": data.get("notes", ""),
        "applied_at": now,
        "updated_at": now,
    }
    applications.append(app)
    _save_applications(user_id, applications)
    return app


def get_application(user_id: str, app_id: str) -> Optional[dict]:
    for app in _load_applications(user_id):
        if app["id"] == app_id:
            return app
    return None


def update_application(user_id: str, app_id: str, data: dict) -> Optional[dict]:
    applications = _load_applications(user_id)
    for app in applications:
        if app["id"] == app_id:
            for field in ("job_title", "company", "location", "status", "version_id", "version_name", "job_url", "notes"):
                if field in data:
                    app[field] = data[field]
            app["updated_at"] = _now()
            _save_applications(user_id, applications)
            return app
    return None


def delete_application(user_id: str, app_id: str) -> bool:
    applications = _load_applications(user_id)
    new_list = [a for a in applications if a["id"] != app_id]
    if len(new_list) == len(applications):
        return False
    _save_applications(user_id, new_list)
    return True


# ---------------------------------------------------------------------------
# Backward-compat wrappers (used by existing GET/PUT /api/resume endpoints)
# ---------------------------------------------------------------------------


def load_resume(user_id: str) -> str:
    init_user(user_id)
    active_id = get_active_version_id(user_id)
    if active_id is None:
        return SAMPLE_RESUME
    content = load_version(user_id, active_id)
    return content if content is not None else SAMPLE_RESUME


def save_resume(user_id: str, content: str) -> None:
    init_user(user_id)
    active_id = get_active_version_id(user_id)
    if active_id:
        save_version(user_id, active_id, content=content)
