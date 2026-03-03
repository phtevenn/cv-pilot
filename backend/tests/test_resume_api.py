def test_get_resume_unauthenticated(client):
    resp = client.get("/api/resume")
    assert resp.status_code == 401


def test_get_resume_authenticated(client, auth_headers):
    resp = client.get("/api/resume", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "content" in data
    assert len(data["content"]) > 0


def test_put_resume_persists(client, auth_headers):
    client.put(
        "/api/resume", json={"content": "# Updated Resume"}, headers=auth_headers
    )
    resp = client.get("/api/resume", headers=auth_headers)
    assert resp.json()["content"] == "# Updated Resume"


def test_put_resume_returns_ok(client, auth_headers):
    resp = client.put(
        "/api/resume", json={"content": "anything"}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_list_versions_returns_list(client, auth_headers):
    resp = client.get("/api/resume/versions", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


def test_create_version_becomes_active(client, auth_headers):
    resp = client.post(
        "/api/resume/versions",
        json={"name": "New Version", "content": "# New"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Version"
    assert data["is_active"] is True


def test_get_version_not_found(client, auth_headers):
    resp = client.get("/api/resume/versions/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


def test_get_version_returns_content(client, auth_headers):
    create_resp = client.post(
        "/api/resume/versions",
        json={"name": "Test", "content": "test content"},
        headers=auth_headers,
    )
    vid = create_resp.json()["id"]
    resp = client.get(f"/api/resume/versions/{vid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["content"] == "test content"


def test_update_version(client, auth_headers):
    create_resp = client.post(
        "/api/resume/versions",
        json={"name": "Test", "content": "original"},
        headers=auth_headers,
    )
    vid = create_resp.json()["id"]
    resp = client.put(
        f"/api/resume/versions/{vid}",
        json={"content": "modified", "name": "Modified"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Modified"


def test_update_version_not_found(client, auth_headers):
    resp = client.put(
        "/api/resume/versions/nonexistent",
        json={"content": "x"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_delete_version(client, auth_headers):
    create_resp = client.post(
        "/api/resume/versions",
        json={"name": "Extra", "content": "extra"},
        headers=auth_headers,
    )
    vid = create_resp.json()["id"]
    resp = client.delete(f"/api/resume/versions/{vid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_delete_last_version_returns_400(client, auth_headers):
    versions = client.get("/api/resume/versions", headers=auth_headers).json()
    assert len(versions) == 1
    vid = versions[0]["id"]
    resp = client.delete(f"/api/resume/versions/{vid}", headers=auth_headers)
    assert resp.status_code == 400


def test_invalid_token_returns_401(client):
    resp = client.get(
        "/api/resume", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert resp.status_code == 401
