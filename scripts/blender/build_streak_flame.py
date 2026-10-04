import bpy
import math
from mathutils import Vector


COLLECTION_NAME = 'STREAK_FLAME_V1'
SCENE_NAME = 'StreakFlame_Preview'
WORLD_NAME = 'StreakFlame_World'
ASSET_OWNER = 'tezca-streak-flame-v1'
BLEND_PATH = 'C:/Users/Admin/Tezca-china/assets/streak/streak-flame-v1.blend'
GLB_PATH = 'C:/Users/Admin/Tezca-china/public/models/streak/streak-flame-v1.glb'


def shader_socket(node, *names):
    for socket in node.inputs:
        if socket.name in names or socket.identifier in names:
            return socket
    return None


def set_socket(node, names, value):
    socket = shader_socket(node, *names)
    if socket is not None:
        socket.default_value = value


def make_material(name, base, emission, emission_strength, roughness, metallic=0.0, coat=0.0):
    material = bpy.data.materials.get(name)
    if material is None or material.get('streak_asset_owner') != ASSET_OWNER:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.location = (-280, 0)
    output.location = (20, 0)
    set_socket(shader, ('Base Color', 'base_color'), (*base, 1.0))
    set_socket(shader, ('Metallic', 'Metallic IOR Level', 'metallic'), metallic)
    set_socket(shader, ('Roughness', 'roughness'), roughness)
    set_socket(shader, ('Coat Weight', 'coat_weight'), coat)
    set_socket(shader, ('Coat Roughness', 'coat_roughness'), 0.22)
    set_socket(shader, ('Emission Color', 'emission_color'), (*emission, 1.0))
    set_socket(shader, ('Emission Strength', 'emission_strength'), emission_strength)
    links.new(shader.outputs[0], output.inputs[0])
    material.diffuse_color = (*base, 1.0)
    material['streak_asset_owner'] = ASSET_OWNER
    material['streak_material_role'] = name
    return material


def smooth_specs(specs, steps=3):
    result = []
    for index in range(len(specs) - 1):
        a, b = specs[max(0, index - 1)], specs[index]
        c, d = specs[index + 1], specs[min(len(specs) - 1, index + 2)]
        for step in range(steps):
            t = step / steps
            result.append(tuple(
                0.5 * (2 * b[k] + (-a[k] + c[k]) * t
                       + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t
                       + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t)
                for k in range(6)
            ))
    return result + [specs[-1]]


def append_loft(verts, faces, specs, segments=24, phase=0.0, tip_raise=0.12, tip_offset=(0.0, 0.0)):
    rings = []
    for z, rx, ry, cx, cy, twist in smooth_specs(specs):
        ring = []
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            wave = 1.0 + 0.05 * math.sin(3.0 * angle + phase) + 0.028 * math.cos(5.0 * angle - phase)
            local_angle = angle + twist
            ring.append(len(verts))
            verts.append((
                cx + rx * wave * math.cos(local_angle),
                cy + ry * wave * math.sin(local_angle),
                z,
            ))
        rings.append(ring)

    for ring_a, ring_b in zip(rings, rings[1:]):
        for i in range(segments):
            ni = (i + 1) % segments
            faces.append((ring_a[i], ring_a[ni], ring_b[ni], ring_b[i]))

    faces.append(tuple(reversed(rings[0])))
    last_z, _, _, last_cx, last_cy, _ = specs[-1]
    tip = len(verts)
    verts.append((last_cx + tip_offset[0], last_cy + tip_offset[1], last_z + tip_raise))
    for i in range(segments):
        ni = (i + 1) % segments
        faces.append((rings[-1][i], rings[-1][ni], tip))


def make_flame_mesh(name, parts, material, collection, segments=24):
    verts = []
    faces = []
    for specs, phase, tip_raise, tip_offset in parts:
        append_loft(
            verts,
            faces,
            specs,
            segments=segments,
            phase=phase,
            tip_raise=tip_raise,
            tip_offset=tip_offset,
        )
    mesh = bpy.data.meshes.new(name + '_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh['streak_asset_owner'] = ASSET_OWNER
    mesh['streak_triangle_budget'] = 12000
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    obj['streak_asset_owner'] = ASSET_OWNER
    obj['streak_asset_part'] = name
    return obj


def make_cylinder(name, material, collection, segments=36):
    verts = []
    faces = []
    bottom_z, top_z = 0.0, 0.16
    bottom_radius, top_radius = 0.72, 0.66
    for z, radius in ((bottom_z, bottom_radius), (top_z, top_radius)):
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            verts.append((radius * math.cos(angle), radius * math.sin(angle), z))
    for i in range(segments):
        ni = (i + 1) % segments
        faces.append((i, ni, segments + ni, segments + i))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple(range(segments, segments * 2)))
    mesh = bpy.data.meshes.new(name + '_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh['streak_asset_owner'] = ASSET_OWNER
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    obj['streak_asset_owner'] = ASSET_OWNER
    obj['streak_asset_part'] = name
    return obj


def make_torus(name, material, collection, major_segments=40, minor_segments=8):
    verts = []
    faces = []
    major_radius, minor_radius, z_center = 0.68, 0.032, 0.18
    for i in range(major_segments):
        major_angle = 2.0 * math.pi * i / major_segments
        for j in range(minor_segments):
            minor_angle = 2.0 * math.pi * j / minor_segments
            radius = major_radius + minor_radius * math.cos(minor_angle)
            verts.append((
                radius * math.cos(major_angle),
                radius * math.sin(major_angle),
                z_center + minor_radius * math.sin(minor_angle),
            ))
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            a = i * minor_segments + j
            b = ni * minor_segments + j
            c = ni * minor_segments + nj
            d = i * minor_segments + nj
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name + '_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh['streak_asset_owner'] = ASSET_OWNER
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    obj['streak_asset_owner'] = ASSET_OWNER
    obj['streak_asset_part'] = name
    return obj


def point_object(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def add_preview_camera(scene, collection):
    camera_data = bpy.data.cameras.new('StreakFlame_PreviewCamera_Data')
    camera = bpy.data.objects.new('StreakFlame_PreviewCamera', camera_data)
    camera.location = (1.35, -4.35, 2.15)
    camera_data.lens = 58
    point_object(camera, (0.0, 0.0, 1.05))
    collection.objects.link(camera)
    camera['streak_asset_owner'] = ASSET_OWNER
    scene.camera = camera
    return camera


def add_preview_light(name, light_type, location, energy, color, collection, size=3.0):
    light_data = bpy.data.lights.new(name + '_Data', type=light_type)
    light_data.energy = energy
    light_data.color = color
    if light_type == 'AREA':
        light_data.shape = 'DISK'
        light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    light.location = location
    point_object(light, (0.0, 0.0, 0.95))
    collection.objects.link(light)
    light['streak_asset_owner'] = ASSET_OWNER
    return light


def check_names_available():
    # Never delete or rewrite existing scene data, even when names collide.
    if bpy.data.scenes.get(SCENE_NAME) or bpy.data.collections.get(COLLECTION_NAME):
        raise RuntimeError('Streak asset scene already exists; inspect it before rebuilding.')
    for datablocks in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                       bpy.data.worlds, bpy.data.cameras, bpy.data.lights):
        if any(item.name.startswith('StreakFlame_') for item in datablocks):
            raise RuntimeError('Streak asset names already exist; use a fresh Blender file.')


def validate_asset(scene):
    if scene.get('streak_asset_owner') != ASSET_OWNER:
        raise RuntimeError('Refusing to export an unrelated scene.')
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    expected = {'StreakFlame_' + part for part in ('Outer', 'Inner', 'Core', 'Pedestal', 'Halo')}
    if {obj.name for obj in meshes} != expected:
        raise RuntimeError('Unexpected asset meshes.')
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    if triangles > 12000:
        raise RuntimeError('Streak flame exceeds the 12,000 triangle budget.')
    scene['triangle_count'] = triangles
    print('Streak flame:', len(meshes), 'meshes,', triangles, 'triangles')
    return meshes


def save_and_export(scene):
    """Call after inspecting the preview and checking that output paths are unused."""
    meshes = validate_asset(scene)
    window = bpy.context.window
    if window is None or bpy.context.mode != 'OBJECT':
        raise RuntimeError('Export requires a Blender window in Object Mode.')
    original_scene = window.scene
    original_layer = window.view_layer
    try:
        window.scene = scene
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        # Save a copy of the full working state without changing the open filepath.
        bpy.ops.wm.save_as_mainfile(
            filepath=BLEND_PATH, copy=True, compress=True, check_existing=False,
        )
        bpy.ops.export_scene.gltf(
            filepath=GLB_PATH,
            export_format='GLB',
            use_selection=True,
            use_active_scene=True,
            export_apply=True,
            export_materials='EXPORT',
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_image_format='NONE',
            export_extras=True,
        )
    finally:
        # Selection belongs to each scene/view layer; the original was never changed.
        window.scene = original_scene
        window.view_layer = original_layer


def build():
    check_names_available()
    scene = bpy.data.scenes.new(SCENE_NAME)
    scene['streak_asset_owner'] = ASSET_OWNER
    scene['asset_id'] = 'streak-flame-v1'
    scene['asset_version'] = 1
    scene['asset_purpose'] = 'Tezca daily learning streak hero flame'
    scene['triangle_budget'] = 12000
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('StreakFlame_World')
    scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (0.035, 0.022, 0.014, 1.0)
    background.inputs['Strength'].default_value = 0.4

    collection = bpy.data.collections.new(COLLECTION_NAME)
    collection['streak_asset_owner'] = ASSET_OWNER
    collection['asset_id'] = 'streak-flame-v1'
    collection['asset_version'] = 1
    scene.collection.children.link(collection)

    outer_material = make_material(
        'StreakFlame_Outer_Mat',
        (0.42, 0.012, 0.002),
        (0.72, 0.008, 0.001),
        0.55,
        0.32,
        metallic=0.02,
        coat=0.18,
    )
    inner_material = make_material(
        'StreakFlame_Inner_Mat',
        (0.9, 0.07, 0.004),
        (1.0, 0.08, 0.002),
        0.85,
        0.28,
        metallic=0.01,
        coat=0.2,
    )
    core_material = make_material(
        'StreakFlame_Core_Mat',
        (1.0, 0.32, 0.012),
        (1.0, 0.48, 0.025),
        1.25,
        0.22,
        metallic=0.0,
        coat=0.24,
    )
    base_material = make_material(
        'StreakFlame_Base_Mat',
        (0.12, 0.012, 0.002),
        (0.24, 0.006, 0.001),
        0.35,
        0.25,
        metallic=0.18,
        coat=0.3,
    )
    halo_material = make_material(
        'StreakFlame_Halo_Mat',
        (0.8, 0.1, 0.002),
        (1.0, 0.15, 0.003),
        1.2,
        0.2,
        metallic=0.0,
        coat=0.04,
    )

    outer_parts = [
        ([
            (0.16, 0.62, 0.42, 0.00, 0.02, 0.00),
            (0.38, 0.72, 0.49, -0.03, 0.02, 0.03),
            (0.70, 0.64, 0.43, 0.06, 0.03, -0.04),
            (1.04, 0.54, 0.36, -0.07, 0.04, 0.05),
            (1.38, 0.43, 0.28, 0.08, 0.05, -0.05),
            (1.70, 0.31, 0.20, -0.04, 0.07, 0.04),
            (1.99, 0.18, 0.11, 0.12, 0.08, -0.06),
            (2.18, 0.045, 0.028, 0.22, 0.09, 0.01),
        ], 0.2, 0.22, (0.06, 0.015)),
        ([
            (0.18, 0.26, 0.19, -0.42, -0.05, 0.0),
            (0.42, 0.27, 0.20, -0.52, -0.03, -0.04),
            (0.70, 0.20, 0.14, -0.56, 0.00, 0.05),
            (0.97, 0.13, 0.085, -0.50, 0.04, -0.05),
            (1.18, 0.035, 0.022, -0.39, 0.08, 0.0),
        ], 1.5, 0.18, (0.05, 0.02)),
        ([
            (0.18, 0.23, 0.18, 0.40, -0.03, 0.0),
            (0.40, 0.25, 0.18, 0.50, -0.01, 0.05),
            (0.66, 0.17, 0.12, 0.54, 0.03, -0.04),
            (0.90, 0.10, 0.065, 0.47, 0.07, 0.04),
            (1.11, 0.03, 0.018, 0.36, 0.11, 0.0),
        ], -0.8, 0.17, (-0.035, 0.015)),
    ]
    inner_parts = [(
        [
            (0.19, 0.48, 0.31, 0.00, -0.31, 0.0),
            (0.46, 0.51, 0.33, 0.02, -0.32, -0.03),
            (0.78, 0.41, 0.26, -0.05, -0.33, 0.04),
            (1.10, 0.32, 0.20, 0.07, -0.32, -0.05),
            (1.40, 0.22, 0.13, -0.04, -0.30, 0.04),
            (1.66, 0.12, 0.065, 0.10, -0.28, -0.03),
            (1.82, 0.035, 0.02, 0.16, -0.27, 0.0),
        ], 0.55, 0.18, (0.04, 0.01),
    )]
    core_parts = [(
        [
            (0.21, 0.28, 0.20, 0.00, -0.58, 0.0),
            (0.42, 0.33, 0.22, -0.01, -0.59, 0.04),
            (0.68, 0.27, 0.17, 0.04, -0.60, -0.05),
            (0.94, 0.19, 0.115, -0.03, -0.58, 0.03),
            (1.18, 0.11, 0.06, 0.06, -0.55, -0.04),
            (1.36, 0.03, 0.018, 0.11, -0.52, 0.0),
        ], -0.3, 0.16, (0.03, 0.0),
    )]

    make_flame_mesh('StreakFlame_Outer', outer_parts, outer_material, collection, segments=24)
    make_flame_mesh('StreakFlame_Inner', inner_parts, inner_material, collection, segments=24)
    make_flame_mesh('StreakFlame_Core', core_parts, core_material, collection, segments=20)
    make_cylinder('StreakFlame_Pedestal', base_material, collection)
    make_torus('StreakFlame_Halo', halo_material, collection)
    add_preview_camera(scene, collection)
    add_preview_light('StreakFlame_Key', 'AREA', (3.2, -4.5, 4.4), 480.0, (1.0, 0.36, 0.12), collection, 3.5)
    add_preview_light('StreakFlame_Fill', 'AREA', (-3.0, -1.5, 2.3), 260.0, (1.0, 0.12, 0.025), collection, 3.0)
    add_preview_light('StreakFlame_Rim', 'POINT', (0.6, 1.8, 2.8), 180.0, (1.0, 0.45, 0.12), collection)

    validate_asset(scene)
    return scene


if __name__ == '__main__':
    # Build without changing the active scene; inspect before calling save_and_export.
    build()
