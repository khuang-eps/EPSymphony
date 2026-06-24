def extract_staff_positions(image_path):
    # return [y1, y2, y3...]
    pass

def generate_linear_positions(measures, page_height=2000):
    total = len(measures)
    return [i / total * page_height for i in range(total)]