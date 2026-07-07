import math
from PIL import Image

def process_and_split_feathered():
    # Load original image
    img = Image.open('src/assets/dragon-phoenix.webp')
    img_rgba = img.convert('RGBA')
    width, height = img_rgba.size
    
    # Create empty transparent images for dragon and phoenix
    dragon_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    phoenix_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    # Thresholds for color distance from pure white (255, 255, 255)
    # Max distance is sqrt(3 * 255^2) = 441.67
    # If distance is small, it's white background -> transparent
    t_inner = 30.0  # Pixels closer than this to white are fully transparent
    t_outer = 75.0  # Pixels further than this are fully opaque
    
    for y in range(height):
        for x in range(width):
            # Remove border
            if x < 18 or x > 682 or y < 18 or y > 682:
                continue
                
            r, g, b, a = img_rgba.getpixel((x, y))
            
            # Calculate Euclidean distance from white (255, 255, 255)
            dist = math.sqrt((255 - r)**2 + (255 - g)**2 + (255 - b)**2)
            
            if dist < t_inner:
                alpha = 0
            elif dist > t_outer:
                alpha = 255
            else:
                # Interpolate alpha smoothly between 0 and 255
                alpha = int(255 * (dist - t_inner) / (t_outer - t_inner))
                
            if alpha > 0:
                # To remove the white halo, we reconstruct the original color.
                # Assuming the pixel was blended with white: C_observed = C_original * (alpha/255) + 255 * (1 - alpha/255)
                # Therefore: C_original = (C_observed - 255 * (1 - alpha/255)) / (alpha/255)
                # We clamp to 0-255.
                alpha_factor = alpha / 255.0
                new_r = max(0, min(255, int((r - 255 * (1.0 - alpha_factor)) / alpha_factor)))
                new_g = max(0, min(255, int((g - 255 * (1.0 - alpha_factor)) / alpha_factor)))
                new_b = max(0, min(255, int((b - 255 * (1.0 - alpha_factor)) / alpha_factor)))
                
                # Classify based on diagonal split (y = x + 60)
                if y < x + 60:
                    # Dragon
                    dragon_img.putpixel((x, y), (new_r, new_g, new_b, alpha))
                else:
                    # Phoenix
                    phoenix_img.putpixel((x, y), (new_r, new_g, new_b, alpha))
                
    # Crop to content bounding box
    def crop_to_content(image):
        bbox = image.getbbox()
        if bbox:
            return image.crop(bbox)
        return image

    cropped_dragon = crop_to_content(dragon_img)
    cropped_phoenix = crop_to_content(phoenix_img)
    
    # Save output images
    cropped_dragon.save('public/dragon.png', 'PNG')
    cropped_phoenix.save('public/phoenix.png', 'PNG')
    print("Successfully processed, feathered and split dragon.png and phoenix.png!")
    print(f"Feathered Dragon size: {cropped_dragon.size}")
    print(f"Feathered Phoenix size: {cropped_phoenix.size}")

if __name__ == '__main__':
    process_and_split_feathered()
