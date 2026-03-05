import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from database import Application, ResumeVersion, UserMeta, get_engine

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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _version_to_meta(v: ResumeVersion, active_id: Optional[str]) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "created_at": v.created_at,
        "updated_at": v.updated_at,
        "is_active": v.id == active_id,
    }


# ---------------------------------------------------------------------------
# Public API — same signatures as the old file-based storage
# ---------------------------------------------------------------------------


def init_user(user_id: str) -> None:
    """Ensure a user has at least one version, seeding with the sample if new."""
    with Session(get_engine()) as session:
        meta = session.get(UserMeta, user_id)
        if meta is None:
            # Brand-new user — create sample version
            now = _now()
            vid = str(uuid.uuid4())
            version = ResumeVersion(
                id=vid,
                user_id=user_id,
                name=DEFAULT_VERSION_NAME,
                content=SAMPLE_RESUME,
                created_at=now,
                updated_at=now,
            )
            meta = UserMeta(user_id=user_id, active_version_id=vid)
            session.add(version)
            session.add(meta)
            session.commit()
        elif meta.active_version_id is None:
            # Has meta but no active version — check if versions exist
            stmt = select(ResumeVersion).where(ResumeVersion.user_id == user_id).limit(1)
            first = session.exec(stmt).first()
            if first is None:
                now = _now()
                vid = str(uuid.uuid4())
                version = ResumeVersion(
                    id=vid,
                    user_id=user_id,
                    name=DEFAULT_VERSION_NAME,
                    content=SAMPLE_RESUME,
                    created_at=now,
                    updated_at=now,
                )
                session.add(version)
                meta.active_version_id = vid
                session.add(meta)
                session.commit()
            else:
                meta.active_version_id = first.id
                session.add(meta)
                session.commit()


def list_versions(user_id: str) -> list[dict]:
    init_user(user_id)
    with Session(get_engine()) as session:
        meta = session.get(UserMeta, user_id)
        active_id = meta.active_version_id if meta else None
        stmt = select(ResumeVersion).where(ResumeVersion.user_id == user_id)
        versions = session.exec(stmt).all()
        return [_version_to_meta(v, active_id) for v in versions]


def create_version(user_id: str, name: str, content: str) -> dict:
    init_user(user_id)
    now = _now()
    vid = str(uuid.uuid4())
    with Session(get_engine()) as session:
        version = ResumeVersion(
            id=vid,
            user_id=user_id,
            name=name,
            content=content,
            created_at=now,
            updated_at=now,
        )
        session.add(version)
        session.commit()
        session.refresh(version)
        meta = session.get(UserMeta, user_id)
        active_id = meta.active_version_id if meta else None
        return _version_to_meta(version, active_id)


def load_version(user_id: str, version_id: str) -> Optional[str]:
    with Session(get_engine()) as session:
        stmt = (
            select(ResumeVersion)
            .where(ResumeVersion.user_id == user_id)
            .where(ResumeVersion.id == version_id)
        )
        version = session.exec(stmt).first()
        return version.content if version else None


def save_version(
    user_id: str,
    version_id: str,
    content: Optional[str] = None,
    new_name: Optional[str] = None,
) -> Optional[dict]:
    """Update content and/or name of a version. Returns updated metadata or None if not found."""
    with Session(get_engine()) as session:
        stmt = (
            select(ResumeVersion)
            .where(ResumeVersion.user_id == user_id)
            .where(ResumeVersion.id == version_id)
        )
        version = session.exec(stmt).first()
        if version is None:
            return None
        version.updated_at = _now()
        if new_name is not None:
            version.name = new_name
        if content is not None:
            version.content = content
        session.add(version)
        session.commit()
        session.refresh(version)
        meta = session.get(UserMeta, user_id)
        active_id = meta.active_version_id if meta else None
        return _version_to_meta(version, active_id)


def delete_version(user_id: str, version_id: str) -> bool:
    """Delete a version. Returns False (and does nothing) if it's the last one."""
    with Session(get_engine()) as session:
        stmt = select(ResumeVersion).where(ResumeVersion.user_id == user_id)
        versions = session.exec(stmt).all()
        if len(versions) <= 1:
            return False
        version = next((v for v in versions if v.id == version_id), None)
        if version is None:
            return False
        session.delete(version)
        # Update active_version_id if needed
        meta = session.get(UserMeta, user_id)
        if meta and meta.active_version_id == version_id:
            remaining = [v for v in versions if v.id != version_id]
            meta.active_version_id = remaining[0].id if remaining else None
            session.add(meta)
        session.commit()
        return True


def get_active_version_id(user_id: str) -> Optional[str]:
    init_user(user_id)
    with Session(get_engine()) as session:
        meta = session.get(UserMeta, user_id)
        return meta.active_version_id if meta else None


def set_active_version(user_id: str, version_id: str) -> bool:
    with Session(get_engine()) as session:
        stmt = (
            select(ResumeVersion)
            .where(ResumeVersion.user_id == user_id)
            .where(ResumeVersion.id == version_id)
        )
        exists = session.exec(stmt).first()
        if not exists:
            return False
        meta = session.get(UserMeta, user_id)
        if meta is None:
            meta = UserMeta(user_id=user_id, active_version_id=version_id)
        else:
            meta.active_version_id = version_id
        session.add(meta)
        session.commit()
        return True


# ---------------------------------------------------------------------------
# Application tracker storage
# ---------------------------------------------------------------------------


def list_applications(user_id: str) -> list[dict]:
    with Session(get_engine()) as session:
        stmt = select(Application).where(Application.user_id == user_id)
        return [a.model_dump() for a in session.exec(stmt).all()]


def create_application(user_id: str, data: dict) -> dict:
    now = _now()
    app = Application(
        id=str(uuid.uuid4()),
        user_id=user_id,
        job_title=data.get("job_title", ""),
        company=data.get("company", ""),
        location=data.get("location", ""),
        status=data.get("status", "applied"),
        version_id=data.get("version_id"),
        version_name=data.get("version_name"),
        job_url=data.get("job_url", ""),
        notes=data.get("notes", ""),
        applied_at=now,
        updated_at=now,
    )
    with Session(get_engine()) as session:
        session.add(app)
        session.commit()
        session.refresh(app)
        return app.model_dump()


def get_application(user_id: str, app_id: str) -> Optional[dict]:
    with Session(get_engine()) as session:
        stmt = (
            select(Application)
            .where(Application.user_id == user_id)
            .where(Application.id == app_id)
        )
        app = session.exec(stmt).first()
        return app.model_dump() if app else None


def update_application(user_id: str, app_id: str, data: dict) -> Optional[dict]:
    with Session(get_engine()) as session:
        stmt = (
            select(Application)
            .where(Application.user_id == user_id)
            .where(Application.id == app_id)
        )
        app = session.exec(stmt).first()
        if app is None:
            return None
        for field in ("job_title", "company", "location", "status", "version_id", "version_name", "job_url", "notes"):
            if field in data:
                setattr(app, field, data[field])
        app.updated_at = _now()
        session.add(app)
        session.commit()
        session.refresh(app)
        return app.model_dump()


def delete_application(user_id: str, app_id: str) -> bool:
    with Session(get_engine()) as session:
        stmt = (
            select(Application)
            .where(Application.user_id == user_id)
            .where(Application.id == app_id)
        )
        app = session.exec(stmt).first()
        if app is None:
            return False
        session.delete(app)
        session.commit()
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
