import storage


def test_init_user_creates_default_version(tmp_storage):
    storage.init_user("user1")
    versions = storage.list_versions("user1")
    assert len(versions) == 1
    assert versions[0]["name"] == storage.DEFAULT_VERSION_NAME
    assert versions[0]["is_active"] is True


def test_load_resume_returns_sample_for_new_user(tmp_storage):
    content = storage.load_resume("newuser")
    assert len(content) > 0


def test_create_and_load_version(tmp_storage):
    storage.init_user("user1")
    meta = storage.create_version("user1", "v2", "# My Resume v2")
    loaded = storage.load_version("user1", meta["id"])
    assert loaded == "# My Resume v2"


def test_load_version_returns_none_for_missing(tmp_storage):
    assert storage.load_version("user1", "nonexistent-id") is None


def test_save_version_updates_content(tmp_storage):
    storage.init_user("user1")
    vid = storage.list_versions("user1")[0]["id"]
    storage.save_version("user1", vid, content="updated content")
    assert storage.load_version("user1", vid) == "updated content"


def test_save_version_renames(tmp_storage):
    storage.init_user("user1")
    vid = storage.list_versions("user1")[0]["id"]
    storage.save_version("user1", vid, new_name="Renamed")
    updated = next(v for v in storage.list_versions("user1") if v["id"] == vid)
    assert updated["name"] == "Renamed"


def test_save_version_returns_none_for_missing(tmp_storage):
    result = storage.save_version("user1", "nonexistent", content="x")
    assert result is None


def test_delete_version_removes_it(tmp_storage):
    storage.init_user("user1")
    meta = storage.create_version("user1", "extra", "extra content")
    extra_id = meta["id"]
    ok = storage.delete_version("user1", extra_id)
    assert ok is True
    assert all(v["id"] != extra_id for v in storage.list_versions("user1"))


def test_delete_last_version_fails(tmp_storage):
    storage.init_user("user1")
    versions = storage.list_versions("user1")
    assert len(versions) == 1
    ok = storage.delete_version("user1", versions[0]["id"])
    assert ok is False


def test_set_active_version(tmp_storage):
    storage.init_user("user1")
    meta = storage.create_version("user1", "v2", "content v2")
    storage.set_active_version("user1", meta["id"])
    assert storage.get_active_version_id("user1") == meta["id"]


def test_set_active_invalid_version_returns_false(tmp_storage):
    storage.init_user("user1")
    ok = storage.set_active_version("user1", "nonexistent-id")
    assert ok is False


def test_delete_active_version_reassigns_active(tmp_storage):
    storage.init_user("user1")
    first_id = storage.list_versions("user1")[0]["id"]
    second = storage.create_version("user1", "v2", "v2 content")
    storage.set_active_version("user1", second["id"])
    storage.delete_version("user1", second["id"])
    assert storage.get_active_version_id("user1") == first_id


def test_legacy_migration(tmp_storage):
    """A plain {user_id}.md file is migrated into the versioned layout."""
    legacy_file = tmp_storage / "migrated-user.md"
    legacy_file.write_text("# Old resume content")
    storage.init_user("migrated-user")
    assert not legacy_file.exists()
    assert storage.load_resume("migrated-user") == "# Old resume content"


def test_active_version_content_via_load_resume(tmp_storage):
    storage.init_user("user1")
    meta = storage.create_version("user1", "v2", "v2 resume")
    storage.set_active_version("user1", meta["id"])
    assert storage.load_resume("user1") == "v2 resume"
