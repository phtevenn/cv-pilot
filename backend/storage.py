from pathlib import Path

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


def _resume_path(user_id: str) -> Path:
    return RESUMES_DIR / f"{user_id}.md"


def init_user(user_id: str) -> None:
    """Seed a new user's resume with the sample template if none exists."""
    path = _resume_path(user_id)
    if not path.exists():
        path.write_text(SAMPLE_RESUME, encoding="utf-8")


def load_resume(user_id: str) -> str:
    path = _resume_path(user_id)
    if not path.exists():
        init_user(user_id)
    return path.read_text(encoding="utf-8")


def save_resume(user_id: str, content: str) -> None:
    _resume_path(user_id).write_text(content, encoding="utf-8")
